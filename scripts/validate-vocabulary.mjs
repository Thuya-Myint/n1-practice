/**
 * Reconcile row-level OCR with JMdict without overwriting the source evidence.
 * Only `verified` records are safe to consume as a study answer.  `proposed`
 * records are useful suggestions, and `needsReview` keeps its raw OCR/crops.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const root = process.cwd();
const [manifest, lines, fields, dictionary] = await Promise.all([
  readJson(path.join(root, 'data/row-manifest.json')),
  readJson(path.join(root, 'data/recognition-lines.json')),
  readJson(path.join(root, 'data/recognition-fields.json')),
  readJson(path.join(root, 'data/jmdict-eng/jmdict-eng-3.6.2.json')),
]);

const normal = (value = '') => value.normalize('NFKC').replace(/[\s、。・,\.（）()\[\]【】]/g, '');
const hira = (value = '') => normal(value).replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
const kanaPrefix = (value = '') => (hira(value).match(/^[ぁ-んー]+/)?.[0] ?? '');
const glyphPrefix = (value = '') => normal(value).match(/^[々〆ヶ一-龯ぁ-んァ-ヶー]+/)?.[0] ?? '';
const isKanji = (value) => /[々〆ヶ一-龯]/.test(value);
const kanjiPrefix = (value = '') => normal(value)
  // OCR frequently confuses the first character of 一時 with a prolonged mark.
  .replace(/^ー(?=[々〆ヶ一-龯])/, '一')
  .match(/^[々〆ヶ一-龯]+/)?.[0] ?? '';

function distance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        prev[j] + 1,
        current[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = current;
  }
  return prev[b.length];
}
const similarity = (a, b) => {
  a = normal(a); b = normal(b);
  if (!a || !b) return 0;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
};

const bySurface = new Map();
const byFirstKanji = new Map();
const byReadingPrefix = new Map();
function add(map, key, value) {
  if (!key) return;
  const items = map.get(key) ?? [];
  items.push(value);
  map.set(key, items);
}
for (const item of dictionary.words) {
  const spellings = item.kanji.length ? item.kanji.map((entry) => entry.text) : item.kana.map((entry) => entry.text);
  for (const surface of spellings) {
    for (const kana of item.kana) {
      const candidate = { surface, reading: kana.text, dictionaryId: item.id };
      add(bySurface, normal(surface), candidate);
      const first = normal(surface).match(/[々〆ヶ一-龯]/)?.[0];
      add(byFirstKanji, first, candidate);
      const reading = hira(kana.text);
      for (let length = 2; length <= Math.min(reading.length, 7); length += 1) add(byReadingPrefix, reading.slice(0, length), candidate);
    }
  }
}

const linesById = new Map(lines.records.map((entry) => [entry.id, entry]));
const results = [];
for (const record of manifest.records) {
  const rawLine = linesById.get(record.id)?.rawLineOcr ?? { text: '', confidence: 0 };
  const rawField = fields.records[record.id] ?? { word: { text: '', confidence: 0 }, reading: { text: '', confidence: 0 } };
  const wordText = glyphPrefix(rawField.word.text || rawLine.text);
  const readText = kanaPrefix(rawField.reading.text);
  const lineText = normal(rawLine.text);
  const wordKanji = kanjiPrefix(rawField.word.text);
  const lineKanji = kanjiPrefix(rawLine.text);
  const visibleKanji = wordKanji.length >= lineKanji.length ? wordKanji : lineKanji;

  const possible = new Map();
  const consider = (candidate) => {
    const surface = normal(candidate.surface);
    // Do not let a one-character entry (意) win over a longer printed term
    // (意識) just because the reading naturally contains that one kana.
    if (surface.length === 1 && lineText.startsWith(surface) && isKanji(lineText.charAt(1))) return;
    possible.set(`${candidate.surface}\u0000${candidate.reading}`, candidate);
  };
  for (const candidate of bySurface.get(normal(wordText)) ?? []) consider(candidate);
  for (const candidate of bySurface.get(normal(lineText)) ?? []) consider(candidate);
  const firstKanji = (wordText || lineText).match(/[々〆ヶ一-龯]/)?.[0];
  for (const candidate of byFirstKanji.get(firstKanji) ?? []) consider(candidate);
  for (let length = Math.min(readText.length, 7); length >= 2; length -= 1) {
    for (const candidate of byReadingPrefix.get(readText.slice(0, length)) ?? []) consider(candidate);
  }

  const ranked = [...possible.values()].map((candidate) => {
    const surface = normal(candidate.surface);
    const reading = hira(candidate.reading);
    const surfaceKanji = kanjiPrefix(surface);
    const wordSimilarity = Math.max(
      similarity(surface, wordText),
      similarity(surfaceKanji, visibleKanji),
    );
    const readingSimilarity = Math.max(similarity(reading, readText), lineText.includes(reading) ? 1 : 0);
    // A single-character OCR crop is not adequate evidence for a one-character
    // dictionary entry: e.g. 意 must not displace 意識.  The full-line OCR must
    // show the surface immediately followed by its reading.
    const exactSurface = lineText.includes(`${surface}${reading}`);
    const readingStarts = Boolean(readText) && (readText.startsWith(reading) || reading.startsWith(readText));
    // Kanji is the primary key. Furigana only confirms or distinguishes among
    // kanji-close candidates; it must not choose an unrelated word by itself.
    const shortSurfacePenalty = surfaceKanji.length === 1 && visibleKanji.length > 1 ? 0.25 : 0;
    const score = Math.max(0,
      (exactSurface ? 0.68 : wordSimilarity * 0.68)
      + (readingStarts ? 0.32 : readingSimilarity * 0.32)
      - shortSurfacePenalty,
    );
    return { ...candidate, score: Math.min(score, 1), exactSurface, readingStarts, wordSimilarity, readingSimilarity };
  }).sort((a, b) => b.score - a.score || b.wordSimilarity - a.wordSimilarity);

  const best = ranked[0];
  const verified = best && best.exactSurface && best.readingStarts && best.score >= 0.9;
  const likely = best && best.score >= 0.74 && best.wordSimilarity >= 0.65 && best.readingSimilarity >= 0.45;
  const proposed = best && best.score >= 0.62 && best.wordSimilarity >= 0.45 && best.readingSimilarity >= 0.35;
  results.push({
    id: record.id,
    day: record.day,
    printedNumber: record.printedNumber,
    status: verified ? 'verified' : likely ? 'likely' : proposed ? 'proposed' : 'needsReview',
    // Do not put raw OCR into these fields. They remain null until defensible.
    kanjiOrExpression: verified ? best.surface : null,
    reading: verified ? best.reading : null,
    candidate: best ? {
      kanjiOrExpression: best.surface,
      reading: best.reading,
      dictionaryId: best.dictionaryId,
      score: Number(best.score.toFixed(3)),
      exactSurface: best.exactSurface,
      readingStarts: best.readingStarts,
    } : null,
    evidence: {
      rawLineOcr: rawLine,
      wordOcr: rawField.word,
      readingOcr: rawField.reading,
      source: record.source,
      crops: record.crops,
    },
  });
}

const summary = results.reduce((acc, record) => { acc[record.status] = (acc[record.status] ?? 0) + 1; return acc; }, {});
const output = {
  schemaVersion: 2,
  source: { title: 'JLPT N1 この一冊で合格する', receivedPhotos: 83, officialTargetCount: 4045, printedRows: results.length },
  validation: { dictionary: 'JMdict simplified 3.6.2 (2026-09-21)', summary },
  records: results,
};
await fs.writeFile(path.join(root, 'data/vocab-polished.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(root, 'data/vocab-review.json'), `${JSON.stringify({ schemaVersion: 1, records: results.filter((record) => record.status !== 'verified') }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ total: results.length, ...summary }, null, 2));
