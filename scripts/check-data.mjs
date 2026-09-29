import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/row-manifest.json'), 'utf8'));
const polished = JSON.parse(await fs.readFile(path.join(root, 'data/vocab-polished.json'), 'utf8'));
const sourcePhotos = new Set(manifest.records.map((record) => record.source.photo));
const ids = manifest.records.map((record) => record.id);
const missingCrops = [];
for (const record of manifest.records) {
  for (const crop of Object.values(record.crops)) {
    try { await fs.access(path.join(root, crop)); } catch { missingCrops.push(crop); }
  }
}
const status = polished.records.reduce((counts, record) => {
  counts[record.status] = (counts[record.status] ?? 0) + 1;
  return counts;
}, {});
const invalidTrustedRecords = polished.records.filter((record) =>
  record.status === 'verified' && (!record.kanjiOrExpression || !record.reading),
);
const report = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  officialTargetCount: 4045,
  printedRowCount: manifest.records.length,
  photos: { expected: 83, mapped: sourcePhotos.size, complete: sourcePhotos.size === 83 },
  ids: { unique: new Set(ids).size, duplicateCount: ids.length - new Set(ids).size },
  crops: { expected: manifest.records.length * 3, missing: missingCrops.length },
  polishedRecords: polished.records.length,
  status,
  invalidTrustedRecords: invalidTrustedRecords.length,
  pass: sourcePhotos.size === 83 && new Set(ids).size === ids.length && missingCrops.length === 0 && polished.records.length === manifest.records.length && invalidTrustedRecords.length === 0,
};
await fs.writeFile(path.join(root, 'data/quality-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
