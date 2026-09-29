import fs from 'node:fs/promises';

const source = JSON.parse(await fs.readFile('data/vocab-google-ocr.json', 'utf8'));
const dictionary = JSON.parse(await fs.readFile('data/jmdict-eng/jmdict-eng-3.6.2.json', 'utf8'));
const normal = (v = '') => v.normalize('NFKC').replace(/[\s、。・,\.（）()\[\]【】]/g, '');
const hira = (v = '') => normal(v).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const kanaOnly = (v = '') => hira(v).match(/[ぁ-んー]+/g)?.join('') || '';
const kanjiOnly = (v = '') => normal(v).match(/^[々〆ヶ一-龯]+/)?.[0] || '';

function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j];
  }
  return prev[b.length];
}
const similarity = (a, b) => (!a || !b ? 0 : 1 - distance(a, b) / Math.max(a.length, b.length));
const bySurface = new Map();
for (const item of dictionary.words) {
  const surfaces = item.kanji.length ? item.kanji.map((k) => k.text) : item.kana.map((k) => k.text);
  for (const surface of surfaces) {
    const list = bySurface.get(normal(surface)) || [];
    for (const k of item.kana) list.push({ surface, reading: k.text, dictionaryId: item.id });
    bySurface.set(normal(surface), list);
  }
}

const results = source.records.map((row) => {
  const observedSurface = normal(row.kanjiOrExpression || '');
  const observedReading = kanaOnly(row.reading || '');
  let candidates = bySurface.get(observedSurface) || [];
  let matchedBy = 'exact-surface';
  if (!candidates.length && observedSurface) {
    const first = observedSurface[0];
    candidates = [];
    for (const [surface, entries] of bySurface) {
      if (surface[0] === first && Math.abs(surface.length - observedSurface.length) <= 1) {
        for (const entry of entries) candidates.push({ ...entry, surfaceSimilarity: similarity(surface, observedSurface) });
      }
    }
    candidates.sort((a, b) => (b.surfaceSimilarity || 0) - (a.surfaceSimilarity || 0));
    candidates = candidates.slice(0, 30);
    matchedBy = 'fuzzy-surface';
  }
  const ranked = candidates.map((c) => ({
    ...c,
    surfaceSimilarity: c.surfaceSimilarity ?? 1,
    readingSimilarity: similarity(hira(c.reading), observedReading),
  })).sort((a, b) => (b.surfaceSimilarity * 0.7 + b.readingSimilarity * 0.3) - (a.surfaceSimilarity * 0.7 + a.readingSimilarity * 0.3));
  const best = ranked[0];
  const exact = Boolean(best && best.surfaceSimilarity === 1);
  const strong = Boolean(best && exact && (best.readingSimilarity >= 0.35 || !observedReading));
  const status = strong ? 'verified' : best && best.surfaceSimilarity >= 0.7 ? 'proposed' : 'needsReview';
  return {
    id: row.id,
    day: row.day,
    printedNumber: row.printedNumber,
    status,
    kanjiOrExpression: strong ? best.surface : null,
    reading: strong ? best.reading : null,
    candidate: best ? {
      kanjiOrExpression: best.surface,
      reading: best.reading,
      dictionaryId: best.dictionaryId,
      matchedBy,
      surfaceSimilarity: Number(best.surfaceSimilarity.toFixed(3)),
      readingSimilarity: Number(best.readingSimilarity.toFixed(3)),
    } : null,
    evidence: {
      googleVision: { kanjiOrExpression: row.kanjiOrExpression, reading: row.reading, confidence: row.confidence, rawWords: row.rawWords },
      source: row.source,
    },
  };
});
const summary = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
const output = {
  schemaVersion: 3,
  source: { title: 'JLPT N1 この一冊で合格する', receivedPhotos: 83, officialTargetCount: 4045, printedRows: results.length },
  validation: { dictionary: 'JMdict simplified 3.6.2', summary },
  records: results,
};
await fs.writeFile('data/vocab-polished.json', `${JSON.stringify(output, null, 2)}\n`);
await fs.writeFile('data/vocab-review.json', `${JSON.stringify({ schemaVersion: 2, records: results.filter((r) => r.status !== 'verified') }, null, 2)}\n`);
console.log(JSON.stringify({ total: results.length, ...summary }, null, 2));
