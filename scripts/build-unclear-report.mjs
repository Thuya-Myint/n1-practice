import fs from 'node:fs/promises';

const polished = JSON.parse(await fs.readFile('data/vocab-polished.json', 'utf8'));
const unclear = polished.records.filter((r) => r.status !== 'verified').map((r) => ({
  id: r.id,
  lesson: r.day,
  printedNumber: r.printedNumber,
  status: r.status,
  candidateKanji: r.candidate?.kanjiOrExpression || null,
  candidateReading: r.candidate?.reading || null,
  match: r.candidate?.matchedBy || null,
  score: r.candidate?.score ?? null,
  image: r.evidence.source.photo,
  side: r.evidence.source.side,
  crop: r.evidence.crops?.line || null,
}));

const group = (items, key) => Object.values(items.reduce((out, item) => {
  const value = item[key];
  (out[value] ||= []).push(item);
  return out;
}, {}));
const byLesson = group(unclear, 'lesson').map((items) => ({
  lesson: items[0].lesson,
  count: items.length,
  images: [...new Set(items.map((i) => i.image))].sort((a, b) => a - b),
})).sort((a, b) => a.lesson - b.lesson);
const byImage = group(unclear, 'image').map((items) => ({
  image: items[0].image,
  lessons: [...new Set(items.map((i) => i.lesson))].sort((a, b) => a - b),
  count: items.length,
})).sort((a, b) => a.image - b.image);

await fs.writeFile('data/unclear-vocab-by-source.json', `${JSON.stringify({
  totalUnclear: unclear.length,
  notes: ['Unclear means status is proposed or needsReview.', 'Source image numbers refer to photo_1 through photo_83 in the uploaded set.'],
  summaryByLesson: byLesson,
  summaryByImage: byImage,
  records: unclear,
}, null, 2)}\n`);

const headers = ['id','lesson','printedNumber','status','candidateKanji','candidateReading','match','score','image','side','crop'];
const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; };
await fs.writeFile('data/unclear-vocab-by-source.csv', `${[headers, ...unclear.map((r) => headers.map((h) => r[h]))].map((row) => row.map(esc).join(',')).join('\n')}\n`);
console.log(JSON.stringify({ totalUnclear: unclear.length, lessons: byLesson.length, images: byImage.length }, null, 2));
