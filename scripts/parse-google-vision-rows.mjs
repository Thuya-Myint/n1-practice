import fs from 'node:fs/promises';

const manifest = JSON.parse(await fs.readFile('data/row-manifest.json', 'utf8'));
const byPhoto = new Map();

function verticesCenter(box) {
  const vs = box.vertices || [];
  return {
    x: vs.reduce((s, v) => s + (v.x || 0), 0) / vs.length,
    y: vs.reduce((s, v) => s + (v.y || 0), 0) / vs.length,
  };
}

function flattenWords(annotation) {
  const words = [];
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const text = (word.symbols || []).map((s) => s.text || '').join('');
          if (!text) continue;
          const center = verticesCenter(word.boundingBox);
          const confidence = word.confidence ?? paragraph.confidence ?? block.confidence ?? 0;
          words.push({ text, ...center, confidence });
        }
      }
    }
  }
  return words;
}

for (let photo = 1; photo <= 83; photo += 1) {
  const file = `data/cloud-ocr/photo-${String(photo).padStart(2, '0')}.json`;
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  byPhoto.set(photo, flattenWords(saved.response.responses[0].fullTextAnnotation));
}

const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
const hiragana = /[\u3040-\u309f]/;
const clean = (value) => value
  .replace(/[|丨]/g, '')
  .replace(/[“”"'`]/g, '')
  .trim();

const records = manifest.records.map((row) => {
  const words = byPhoto.get(row.source.photo) || [];
  const left = row.source.side === 'left';
  const xMin = left ? 30 : 365;
  const xMax = left ? 350 : 710;
  // Keep the band tight: adjacent rows are usually only 3–6 px apart after
  // perspective distortion, and a wide band merges neighboring entries.
  const yMin = row.source.y - 12;
  const yMax = row.source.y + row.source.height - 5;
  const inRow = words.filter((w) => w.x >= xMin && w.x <= xMax && w.y >= yMin && w.y <= yMax)
    .sort((a, b) => a.x - b.x);
  const number = inRow.find((w) => /^\d{1,3}$/.test(w.text));
  const start = left ? 55 : 405;
  const readingStart = left ? 135 : 485;
  const termWords = inRow.filter((w) => w.x >= start && w.x < readingStart && japanese.test(w.text));
  const readingWords = inRow.filter((w) => w.x >= readingStart && (japanese.test(w.text) || /[()（）]/.test(w.text)));
  const term = clean(termWords.map((w) => w.text).join(''));
  const reading = clean(readingWords.map((w) => w.text).join(''))
    .replace(/[（]/g, '(').replace(/[）]/g, ')');
  const confidenceWords = [...termWords, ...readingWords];
  const confidence = confidenceWords.length
    ? confidenceWords.reduce((s, w) => s + w.confidence, 0) / confidenceWords.length
    : 0;
  return {
    id: row.id,
    day: row.day,
    printedNumber: row.printedNumber,
    source: row.source,
    kanjiOrExpression: term || null,
    reading: reading || null,
    ocrNumber: number?.text || null,
    confidence: Number(confidence.toFixed(3)),
    rawWords: inRow.map(({ text, x, y }) => ({ text, x: Math.round(x), y: Math.round(y) })),
    status: term && reading && hiragana.test(reading) ? 'ocr-extracted' : 'needs-review',
  };
});

const missing = records.filter((r) => !r.kanjiOrExpression || !r.reading).length;
await fs.writeFile('data/vocab-google-ocr.json', `${JSON.stringify({
  status: 'google-vision-ocr-extracted',
  sourcePageCount: 83,
  printedRowCount: records.length,
  missingFields: missing,
  records,
}, null, 2)}\n`);
console.log(`extracted ${records.length} rows; ${missing} have missing term or reading`);
