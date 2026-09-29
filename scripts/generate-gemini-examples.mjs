import fs from 'node:fs';

const inputPath = 'data/vocab-final-study.json';
const outputPath = 'data/vocab-final-study-gemini-drafts.json';
const args = process.argv.slice(2);
const valueOf = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const lesson = Number(valueOf('--lesson') ?? 0);
const limit = Number(valueOf('--limit') ?? 0);
const concurrency = Math.max(1, Number(valueOf('--concurrency') ?? 6));
const model = valueOf('--model') ?? 'gemini-3.8-flash';
const fresh = args.includes('--fresh');
const includeSingleKanji = args.includes('--include-single-kanji');
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set. Set it in this PowerShell session before running this script.');
}

const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const study = !fresh && fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : structuredClone(source);

const candidates = study.records.filter((record) =>
  record.studyReady &&
  record.dictionaryVerified &&
  record.examples?.length !== 2 &&
  (includeSingleKanji || [...record.kanjiOrExpression].length > 1) &&
  (!lesson || record.day === lesson)
);
const work = limit ? candidates.slice(0, limit) : candidates;

const exampleSchema = {
  type: 'object',
  properties: {
    examples: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          ja: { type: 'string' },
          en: { type: 'string' }
        },
        required: ['ja', 'en']
      }
    }
  },
  required: ['examples']
};

const validExamples = (examples) => Array.isArray(examples) && examples.length === 2 && examples.every((example) =>
  typeof example?.ja === 'string' && example.ja.length >= 8 && example.ja.length <= 120 &&
  typeof example?.en === 'string' && example.en.length >= 8 && example.en.length <= 190
);

const callGemini = async (prompt, attempt = 0) => {
  const timeout = AbortSignal.timeout(90_000);
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      signal: timeout,
      body: JSON.stringify({
        model,
        input: `You are a meticulous native Japanese JLPT textbook editor. Return only the requested JSON.\n\n${prompt}`,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: exampleSchema
        }
      })
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      return callGemini(prompt, attempt + 1);
    }
    throw new Error(`Gemini HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }

  const body = await response.json();
  const text = body.output_text ?? body.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === 'text')
    .map((content) => content.text ?? '')
    .join('') ?? '';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 500)}`);
  }
};

const termDetails = (record) => JSON.stringify({
  expression: record.kanjiOrExpression,
  reading: record.reading,
  meanings: record.meanings.slice(0, 3)
});

const createExamples = async (record) => callGemini(
  `Create exactly two natural, real-world Japanese example sentences for this JLPT N1 vocabulary item. Use distinct, plausible situations such as daily life, school, work, or news. Use the target expression exactly or in a grammatically natural inflected form. Do not write a dictionary definition, a generic template, or an unnatural sentence merely designed to contain the word. Provide a concise, accurate English translation for each sentence.\n\nTarget vocabulary: ${termDetails(record)}`
);

const editExamples = async (record, examples) => callGemini(
  `Perform a strict final editorial review of the following two examples for a JLPT N1 study app. Correct any unnatural Japanese, grammar, particles, collocation, target-word meaning, or English translation. Keep two genuinely useful sentences in distinct situations. Return the corrected final examples only.\n\nTarget vocabulary: ${termDetails(record)}\n\nDraft examples: ${JSON.stringify(examples)}`
);

let completed = 0;
let added = 0;
let failed = 0;
let haltReason = '';
let writeChain = Promise.resolve();
const checkpoint = () => {
  study.geminiGeneration = {
    model,
    generatedAt: new Date().toISOString(),
    note: 'Examples were generated from JMdict-verified words and editorially checked by Gemini. They are model-reviewed drafts, not human editorial verification.',
    skippedSingleKanjiByDefault: !includeSingleKanji
  };
  writeChain = writeChain.then(() => fs.writeFileSync(outputPath, `${JSON.stringify(study, null, 2)}\n`));
  return writeChain;
};

const runOne = async (record) => {
  try {
    console.log(JSON.stringify({ status: 'starting', id: record.id }));
    const draft = await createExamples(record);
    if (!validExamples(draft.examples)) throw new Error('Generation response did not contain two valid examples.');
    const edited = await editExamples(record, draft.examples);
    if (!validExamples(edited.examples)) throw new Error('Editorial response did not contain two valid examples.');
    record.examples = edited.examples;
    record.exampleStatus = 'gemini-model-reviewed-draft';
    added += 1;
  } catch (error) {
    failed += 1;
    if (error.message.includes('Gemini HTTP 402')) {
      haltReason = 'Gemini prepaid credits are depleted.';
    }
    console.error(`Failed ${record.id}: ${error.message}`);
  } finally {
    completed += 1;
    await checkpoint();
    console.log(JSON.stringify({ completed, total: work.length, added, failed }));
  }
};

let cursor = 0;
const worker = async () => {
  while (!haltReason && cursor < work.length) {
    const record = work[cursor++];
    await runOne(record);
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, worker));
await writeChain;
if (haltReason) {
  console.error(`Stopped: ${haltReason}`);
  process.exitCode = 2;
}
