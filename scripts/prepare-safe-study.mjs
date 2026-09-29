import fs from 'node:fs/promises';

const app = JSON.parse(await fs.readFile('data/vocab-app.json', 'utf8'));
const polished = JSON.parse(await fs.readFile('data/vocab-polished.json', 'utf8'));
const reviewedFiles = (await fs.readdir('data'))
  .filter((name) => /^vocab-examples-reviewed-batch-\d+\.json$/.test(name))
  .sort();
const reviewed = new Map();
for (const file of reviewedFiles) {
  const batch = JSON.parse(await fs.readFile(`data/${file}`, 'utf8'));
  for (const record of batch.records) reviewed.set(record.id, record.examples);
}
const polishedById = new Map(polished.records.map((r) => [r.id, r]));

const records = app.records.map((record) => {
  const examples = reviewed.get(record.id) || [];
  const source = polishedById.get(record.id);
  return {
    ...record,
    examples,
    exampleStatus: examples.length === 2 ? 'reviewed-draft' : 'not-generated',
    status: source?.status === 'verified' ? 'verified' : record.studyReady ? 'autoAccepted' : 'missing',
  };
});
const output = {
  schemaVersion: 1,
  mode: 'safe-study',
  title: app.title,
  officialTargetCount: app.officialTargetCount,
  printedRowCount: records.length,
  notes: [
    'No template-generated examples are included.',
    'Only vocabulary-specific reviewed examples are included.',
    'Records without examples remain available for vocabulary study but should not display an example section.',
  ],
  records,
};
await fs.writeFile('data/vocab-study-safe.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ total: records.length, reviewedExampleRecords: records.filter((r) => r.examples.length === 2).length, usableVocabulary: records.filter((r) => r.studyReady).length }, null, 2));
