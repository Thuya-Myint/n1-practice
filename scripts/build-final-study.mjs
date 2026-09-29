import fs from 'node:fs';

const final = JSON.parse(fs.readFileSync('data/vocab-final-merged.json', 'utf8'));
const dictionary = JSON.parse(fs.readFileSync('data/jmdict-eng/jmdict-eng-3.6.2.json', 'utf8'));
const exampleFiles = fs.readdirSync('data')
  .filter((name) => /^vocab-examples-reviewed-batch-\d+\.json$/.test(name))
  .sort();
const examples = new Map();
for (const file of exampleFiles) {
  const batch = JSON.parse(fs.readFileSync(`data/${file}`, 'utf8'));
  for (const row of batch.records ?? []) examples.set(row.id, row.examples);
}
const dictionaryById = new Map(dictionary.words.map((word) => [String(word.id), word]));
const glosses = (word) => {
  if (!word) return [];
  const seen = new Set();
  return word.sense.flatMap((sense) => sense.gloss ?? [])
    .filter((gloss) => gloss.lang === 'eng' && gloss.text)
    .map((gloss) => gloss.text.trim())
    .filter((text) => !seen.has(text) && seen.add(text))
    .slice(0, 8);
};
const partsOfSpeech = (word) => [...new Set(word?.sense.flatMap((sense) => sense.partOfSpeech ?? []) ?? [])];
const exactDictionaryMatch = (row, word) => Boolean(
  word &&
  word.kanji.some((item) => item.text === row.kanjiOrExpression) &&
  word.kana.some((item) => item.text === row.reading)
);
const records = final.records.map((row) => {
  const dictionaryId = row.candidate?.dictionaryId ?? null;
  const dictionaryEntry = dictionaryId ? dictionaryById.get(String(dictionaryId)) : null;
  const dictionaryVerified = exactDictionaryMatch(row, dictionaryEntry);
  const verified = row.status === 'verified' && row.kanjiOrExpression && row.reading && dictionaryVerified;
  const rowExamples = examples.get(row.id) ?? [];
  return {
    id: row.id,
    day: row.day,
    printedNumber: row.printedNumber,
    status: row.status,
    studyReady: Boolean(verified),
    reviewRequired: !verified,
    kanjiOrExpression: row.kanjiOrExpression ?? null,
    reading: row.reading ?? null,
    meanings: glosses(dictionaryEntry),
    partsOfSpeech: partsOfSpeech(dictionaryEntry),
    dictionaryId,
    dictionaryVerified,
    examples: rowExamples,
    exampleStatus: rowExamples.length === 2 ? 'reviewed' : 'examplesPending',
    source: row.evidence?.source ?? null
  };
});
const verified = records.filter((row) => row.studyReady);
const output = {
  schemaVersion: 1,
  title: 'JLPT N1 verified vocabulary with reviewed examples',
  notes: [
    'A study-ready row has a verified source form plus an exact surface-and-reading match in JMdict.',
    'English meanings are regenerated directly from the linked JMdict entry; no stale intermediate mapping is used.',
    'Examples are included only when they were written and reviewed as word-specific sentences.',
    'No generic template sentences are used.'
  ],
  summary: {
    totalRows: records.length,
    verifiedRows: verified.length,
    verifiedWithTwoExamples: verified.filter((row) => row.examples.length === 2).length,
    verifiedExamplesPending: verified.filter((row) => row.examples.length !== 2).length
  },
  records
};
fs.writeFileSync('data/vocab-final-study.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.summary));
