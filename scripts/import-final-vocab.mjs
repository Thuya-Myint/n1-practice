import fs from 'node:fs';

const args = process.argv.slice(2);
const valueOf = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const sourcePath = valueOf('--source');
const outputPath = valueOf('--output') ?? 'data/vocab-final-study.json';

if (!sourcePath) throw new Error('Pass the completed file with --source <path>.');

const finalData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(finalData.records)) throw new Error('Expected a top-level records array.');

let repairedRubyAnnotations = 0;
const normalizeFurigana = (html) => html.replace(
  /<ruby>([^<]*)<rp><ruby><\/rp><rt>([^<]*)<\/rt><rp><\/ruby><\/rp><\/ruby>/g,
  (_, surface, reading) => {
    repairedRubyAnnotations += 1;
    return `<ruby>${surface}<rp>(</rp><rt>${reading}</rt><rp>)</rp></ruby>`;
  }
);

const ids = new Set();
for (const record of finalData.records) {
  if (!record.id || ids.has(record.id)) throw new Error(`Missing or duplicate id: ${record.id ?? '(missing)'}`);
  ids.add(record.id);
  if (!record.studyReady || !record.dictionaryVerified) throw new Error(`Non-strict record included: ${record.id}`);
  if (!Array.isArray(record.examples) || record.examples.length !== 2) throw new Error(`Expected two examples: ${record.id}`);
  for (const example of record.examples) {
    if (!example.ja || !example.en || !example.furigana) throw new Error(`Missing example text or furigana: ${record.id}`);
    example.furigana = normalizeFurigana(example.furigana);
  }
  record.exampleStatus = 'reviewed';
}

const output = {
  schemaVersion: 2,
  title: 'JLPT N1 strict verified vocabulary with reviewed examples',
  summary: {
    strictVerifiedRows: finalData.records.length,
    reviewedExamplePairs: finalData.records.length,
    reviewedExampleSentences: finalData.records.length * 2
  },
  finalImport: {
    sourceFile: sourcePath.replaceAll('\\', '/'),
    importedAt: new Date().toISOString(),
    repairedRubyAnnotations
  },
  records: finalData.records
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, records: output.records.length, repairedRubyAnnotations }, null, 2));
