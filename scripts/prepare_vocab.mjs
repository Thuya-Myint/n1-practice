import fs from 'node:fs/promises';

const manifest = JSON.parse(await fs.readFile('data/ocr-hires/manifest.json', 'utf8'));
const pages = [];
const records = [];
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;

for (const page of manifest.pages) {
  const text = await fs.readFile(page.ocr, 'utf8');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidates = [];
  for (const raw of lines) {
    if (!japanese.test(raw)) continue;
    const number = raw.match(/^(?:[^0-9]{0,4})?(\d{1,3})\s+/)?.[1];
    if (!number) continue;
    const content = raw.replace(/^(?:[^0-9]{0,4})?\d{1,3}\s+/, '').trim();
    const parts = content.split(/\s{2,}|\s+\|\s+/).map(part => part.trim()).filter(Boolean);
    const candidate = {
      source: page.source,
      day: page.day,
      pageInDay: page.pageInDay,
      itemNumber: Number(number),
      kanjiOrExpression: parts[0] ?? content,
      reading: parts.slice(1).join(' ') || null,
      rawLine: raw,
      status: 'needs-review'
    };
    candidates.push(candidate);
    records.push(candidate);
  }
  pages.push({ source: page.source, day: page.day, pageInDay: page.pageInDay, candidateCount: candidates.length, candidates });
}

await fs.writeFile('data/vocab-draft.json', JSON.stringify({
  status: 'ocr-draft',
  sourcePageCount: manifest.count,
  candidateCount: records.length,
  note: 'OCR candidates only. Verify against the page image before publishing as study content.',
  records
}, null, 2));

await fs.writeFile('data/page-candidates.json', JSON.stringify({ sourcePageCount: manifest.count, pages }, null, 2));
console.log(`prepared ${records.length} OCR candidates from ${manifest.count} pages`);
