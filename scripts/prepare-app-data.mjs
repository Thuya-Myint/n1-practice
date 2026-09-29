import fs from 'node:fs/promises';

const polished = JSON.parse(await fs.readFile('data/vocab-polished.json', 'utf8'));
const dictionary = JSON.parse(await fs.readFile('data/jmdict-eng/jmdict-eng-3.6.2.json', 'utf8'));
const byId = new Map(dictionary.words.map((word) => [word.id, word]));

function glosses(word) {
  if (!word) return [];
  const seen = new Set();
  return word.sense.flatMap((sense) => sense.gloss || [])
    .filter((gloss) => gloss.lang === 'eng' && gloss.text)
    .map((gloss) => gloss.text.trim())
    .filter((text) => !seen.has(text) && seen.add(text))
    .slice(0, 8);
}

function pos(word) {
  if (!word) return [];
  return [...new Set(word.sense.flatMap((sense) => sense.partOfSpeech || []))];
}

const records = polished.records.map((record) => {
  const candidate = record.candidate;
  const word = candidate ? byId.get(String(candidate.dictionaryId)) : null;
  const canonicalSurface = record.kanjiOrExpression || candidate?.kanjiOrExpression || null;
  const canonicalReading = record.reading || candidate?.reading || null;
  return {
    id: record.id,
    day: record.day,
    printedNumber: record.printedNumber,
    status: record.status,
    studyReady: record.status === 'verified',
    reviewRequired: record.status !== 'verified',
    kanjiOrExpression: canonicalSurface,
    reading: canonicalReading,
    meanings: glosses(word),
    partsOfSpeech: pos(word),
    dictionaryId: candidate?.dictionaryId || null,
    source: {
      photo: record.evidence.source.photo,
      side: record.evidence.source.side,
      x: record.evidence.source.x,
      y: record.evidence.source.y,
      crop: `data/rows/photo-${String(record.evidence.source.photo).padStart(2, '0')}-n-${String(record.printedNumber).padStart(3, '0')}-line.png`,
    },
  };
});

const appData = {
  schemaVersion: 1,
  title: 'JLPT N1 この一冊で合格する',
  officialTargetCount: 4045,
  printedRowCount: records.length,
  sourcePhotos: 83,
  dictionary: 'JMdict simplified 3.6.2',
  notes: [
    'Only studyReady records should be presented as verified study content.',
    'Records requiring review retain a candidate only when a dictionary match was found.',
    'Meanings are English JMdict glosses; they are not generated explanations or example sentences.',
  ],
  records,
};
await fs.writeFile('data/vocab-app.json', `${JSON.stringify(appData, null, 2)}\n`);

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join(' | ') : value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const headers = ['id', 'day', 'printedNumber', 'status', 'studyReady', 'kanjiOrExpression', 'reading', 'meanings', 'partsOfSpeech', 'dictionaryId', 'photo', 'side'];
const rows = [headers, ...records.map((r) => [r.id, r.day, r.printedNumber, r.status, r.studyReady, r.kanjiOrExpression, r.reading, r.meanings, r.partsOfSpeech, r.dictionaryId, r.source.photo, r.source.side])];
await fs.writeFile('data/vocab-app.csv', `${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`);

const summary = records.reduce((a, r) => {
  a.total += 1;
  a[r.status] = (a[r.status] || 0) + 1;
  if (r.meanings.length) a.withMeanings += 1;
  return a;
}, { total: 0, withMeanings: 0 });
console.log(JSON.stringify(summary, null, 2));
