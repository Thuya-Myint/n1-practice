import fs from 'node:fs';

const inputPath = 'data/vocab-final-study.json';
const outputPath = 'data/vocab-final-study-generated.json';
const args = process.argv.slice(2);
const valueOf = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const lesson = Number(valueOf('--lesson') ?? 0);
const limit = Number(valueOf('--limit') ?? 0);
const model = valueOf('--model') ?? 'qwen3:8b';
const fresh = args.includes('--fresh');
const batchSize = 1;

const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const study = !fresh && fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : structuredClone(source);

const candidates = study.records.filter((record) =>
  record.studyReady &&
  record.examples?.length !== 2 &&
  (!lesson || record.day === lesson)
);
const work = limit ? candidates.slice(0, limit) : candidates;

const extractJson = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const objectStart = fenced.search(/[\[{]/);
  const objectEnd = Math.max(fenced.lastIndexOf(']'), fenced.lastIndexOf('}'));
  if (objectStart < 0 || objectEnd < objectStart) throw new Error('No JSON found in model response');
  const parsed = JSON.parse(fenced.slice(objectStart, objectEnd + 1));
  return Array.isArray(parsed) ? parsed : [parsed];
};

const validExamples = (item) => Array.isArray(item?.examples) && item.examples.length === 2 && item.examples.every((example) =>
  typeof example?.ja === 'string' && example.ja.length >= 8 && example.ja.length <= 110 &&
  typeof example?.en === 'string' && example.en.length >= 8 && example.en.length <= 180
);

const schema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    examples: {
      type: 'array', minItems: 2, maxItems: 2,
      items: { type: 'object', properties: { ja: { type: 'string' }, en: { type: 'string' } }, required: ['ja', 'en'] }
    }
  },
  required: ['id', 'examples']
};

const askModel = async (entries) => {
  const record = entries[0];
  const term = { id: record.id, expression: record.kanjiOrExpression, reading: record.reading, meanings: record.meanings.slice(0, 3) };
  const prompt = `あなたは日本語母語話者で、JLPT教材の編集者です。下の単語について、現実的で自然な日本語例文を2つ作ってください。日常、学校、職場、ニュースなど二文は違う場面にし、定型文や意味の説明は避けてください。対象語は文中でそのまま使うか自然に活用します。各文に簡潔で正確な英訳を付けてください。\n\n単語: ${JSON.stringify(term)}`;
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: schema,
      think: false,
      options: { temperature: 0.35, top_p: 0.9, num_predict: 1100 },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  const body = await response.json();
  return extractJson(body.message?.content ?? '');
};

const reviewWithEditorPass = async (record, examples) => {
  const prompt = `あなたは日本語母語話者のJLPT教材校正者です。対象語と例文を確認してください。日本語の語法、助詞、自然なコロケーション、意味、英訳を厳しく確認し、不自然な文は自然な実用文に書き直してください。対象語は自然に使用し、二文の場面を変えてください。必ず修正済みの最終版だけをJSONで返してください。\n\n対象語: ${JSON.stringify({ id: record.id, expression: record.kanjiOrExpression, reading: record.reading, meanings: record.meanings.slice(0, 3) })}\n候補: ${JSON.stringify({ id: record.id, examples })}`;
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: false, format: schema, think: false, options: { temperature: 0.15, top_p: 0.85, num_predict: 1000 }, messages: [{ role: 'user', content: prompt }] })
  });
  if (!response.ok) throw new Error(`Ollama editor HTTP ${response.status}: ${await response.text()}`);
  return extractJson((await response.json()).message?.content ?? '');
};

let added = 0;
let failed = 0;
for (let index = 0; index < work.length; index += batchSize) {
  const batch = work.slice(index, index + batchSize);
  try {
    const generated = await askModel(batch);
    const draft = generated.find((item) => item.id === batch[0].id && validExamples(item));
    const edited = draft ? await reviewWithEditorPass(batch[0], draft.examples) : [];
    const byId = new Map(edited.filter(validExamples).map((item) => [item.id, item.examples]));
    for (const record of batch) {
      const examples = byId.get(record.id);
      if (!examples) {
        failed += 1;
        console.error(`Invalid examples for ${record.id}: ${JSON.stringify(generated)}`);
        continue;
      }
      record.examples = examples;
      record.exampleStatus = 'local-model-reviewed-draft';
      added += 1;
    }
  } catch (error) {
    failed += batch.length;
    console.error(`Batch starting ${batch[0]?.id} failed: ${error.message}`);
  }
  study.localGeneration = {
    model,
    generatedAt: new Date().toISOString(),
    note: 'Examples are locally generated drafts and should be reviewed before being treated as editorially verified.'
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(study, null, 2)}\n`);
  console.log(JSON.stringify({ completed: Math.min(index + batch.length, work.length), total: work.length, added, failed }));
}
