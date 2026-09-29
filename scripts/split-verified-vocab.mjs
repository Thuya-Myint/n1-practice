import fs from 'node:fs';
import path from 'node:path';

const source = JSON.parse(fs.readFileSync('data/vocab-final-study.json', 'utf8'));
const outputDir = 'data/verified-vocab-batches';
const batchSize = 100;
const records = source.records
  .filter((record) => record.studyReady && record.dictionaryVerified)
  .sort((left, right) => left.day - right.day || left.printedNumber - right.printedNumber);

fs.mkdirSync(outputDir, { recursive: true });
const batches = [];
for (let offset = 0; offset < records.length; offset += batchSize) {
  const batchNumber = offset / batchSize + 1;
  const batchRecords = records.slice(offset, offset + batchSize);
  const fileName = `verified-vocab-${String(batchNumber).padStart(2, '0')}.json`;
  const payload = {
    schemaVersion: 1,
    title: 'JLPT N1 strict verified vocabulary',
    batch: batchNumber,
    batchSize: batchRecords.length,
    totalStrictVerified: records.length,
    range: {
      firstId: batchRecords[0].id,
      lastId: batchRecords.at(-1).id,
      firstLesson: batchRecords[0].day,
      lastLesson: batchRecords.at(-1).day
    },
    records: batchRecords
  };
  fs.writeFileSync(path.join(outputDir, fileName), `${JSON.stringify(payload, null, 2)}\n`);
  batches.push({ file: fileName, ...payload.range, records: batchRecords.length });
}

const manifest = {
  schemaVersion: 1,
  title: 'JLPT N1 strict verified vocabulary batches',
  totalStrictVerified: records.length,
  batchSize,
  batchCount: batches.length,
  batches
};
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ totalStrictVerified: records.length, batchCount: batches.length, outputDir }, null, 2));
