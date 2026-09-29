import fs from 'node:fs';

const source = JSON.parse(fs.readFileSync('data/vocab-final-study.json', 'utf8'));
const generated = JSON.parse(fs.readFileSync('data/vocab-final-study-gemini-drafts.json', 'utf8'));
const sourceById = new Map(source.records.map((record) => [record.id, record]));
const generatedRows = generated.records.filter((record) => record.exampleStatus === 'gemini-model-reviewed-draft');

const sameList = (left = [], right = []) => left.length === right.length && left.every((item, index) => item === right[index]);
const audit = generatedRows.map((record) => {
  const canonical = sourceById.get(record.id);
  const flags = [];
  if (!canonical?.dictionaryVerified) flags.push('source-not-strictly-dictionary-verified');
  if (!sameList(record.meanings, canonical?.meanings)) flags.push('meaning-changed-since-generation');
  if ([...canonical.kanjiOrExpression].length === 1) flags.push('single-kanji-target-needs-reading-aware-review');
  if ((record.examples ?? []).some((example) => !example.ja.includes(canonical.kanjiOrExpression))) {
    flags.push('target-not-literal-in-at-least-one-sentence');
  }
  if (canonical.kanjiOrExpression === '突然' && (record.examples ?? []).some((example) => /突然(?:として|たる)/.test(example.ja))) {
    flags.push('invalid-derivation-detected');
  }
  if (canonical.kanjiOrExpression === '含める' && (record.examples ?? []).some((example) => /(?:について|を)事前によく含めて/.test(example.ja))) {
    flags.push('invalid-collocation-detected');
  }
  return {
    id: record.id,
    day: record.day,
    printedNumber: record.printedNumber,
    kanjiOrExpression: canonical?.kanjiOrExpression ?? record.kanjiOrExpression,
    reading: canonical?.reading ?? record.reading,
    flags,
    examples: record.examples
  };
});

const flagCounts = audit.flatMap((item) => item.flags).reduce((counts, flag) => {
  counts[flag] = (counts[flag] ?? 0) + 1;
  return counts;
}, {});
const report = {
  generatedPairs: audit.length,
  acceptedWithoutFlags: audit.filter((item) => item.flags.length === 0).length,
  reviewRequired: audit.filter((item) => item.flags.length > 0).length,
  flagCounts,
  records: audit.filter((item) => item.flags.length > 0)
};
fs.writeFileSync('data/gemini-example-quality-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  generatedPairs: report.generatedPairs,
  acceptedWithoutFlags: report.acceptedWithoutFlags,
  reviewRequired: report.reviewRequired,
  flagCounts
}, null, 2));
