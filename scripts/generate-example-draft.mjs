import fs from 'node:fs/promises';

const data = JSON.parse(await fs.readFile('data/vocab-app.json', 'utf8'));
const meaning = (r) => r.meanings[0] || 'this term';

function examples(r) {
  const term = r.kanjiOrExpression;
  const gloss = meaning(r);
  if (!term) return [];
  return [
    {
      ja: `ニュースでは、${term}について専門家が詳しく説明していた。`,
      en: `On the news, an expert gave a detailed explanation about ${gloss}.`,
    },
    {
      ja: `この問題を考えるとき、${term}を無視することはできない。`,
      en: `When considering this issue, ${gloss} cannot be ignored.`,
    },
  ];
}

const records = data.records.map((record) => ({
  id: record.id,
  day: record.day,
  printedNumber: record.printedNumber,
  status: record.status,
  kanjiOrExpression: record.kanjiOrExpression,
  reading: record.reading,
  meanings: record.meanings,
  examples: examples(record),
  exampleStatus: record.kanjiOrExpression ? 'template-generated-draft' : 'not-generated',
}));

await fs.writeFile('data/vocab-examples-draft.json', `${JSON.stringify({
  schemaVersion: 1,
  source: 'vocab-app.json',
  recordCount: records.length,
  notes: [
    'These examples are complete draft placeholders generated from a general-purpose sentence frame.',
    'They require Japanese naturalness and meaning-fit review before being shown as final study content.',
  ],
  records,
}, null, 2)}\n`);
console.log(JSON.stringify({ total: records.length, withExamples: records.filter((r) => r.examples.length === 2).length }, null, 2));
