import fs from 'node:fs/promises';

const polished = JSON.parse(await fs.readFile('data/vocab-polished.json', 'utf8'));
const app = JSON.parse(await fs.readFile('data/vocab-app.json', 'utf8'));
const draft = JSON.parse(await fs.readFile('data/vocab-examples-draft.json', 'utf8'));
const appById = new Map(app.records.map((r) => [r.id, r]));
const examplesById = new Map(draft.records.map((r) => [r.id, r.examples]));

const records = polished.records.map((raw) => {
  const source = appById.get(raw.id);
  const hasCandidate = Boolean(raw.candidate);
  return {
    id: raw.id,
    day: raw.day,
    printedNumber: raw.printedNumber,
    status: raw.status === 'verified' ? 'verified' : hasCandidate ? 'autoAccepted' : 'missing',
    studyReady: hasCandidate,
    kanjiOrExpression: source?.kanjiOrExpression || null,
    reading: source?.reading || null,
    meanings: source?.meanings || [],
    partsOfSpeech: source?.partsOfSpeech || [],
    examples: examplesById.get(raw.id) || [],
    exampleStatus: examplesById.has(raw.id) ? 'template-draft' : 'missing',
    dictionaryId: raw.candidate?.dictionaryId || null,
    source: source?.source || null,
  };
});

const output = {
  schemaVersion: 1,
  mode: 'fast-study',
  title: 'JLPT N1 この一冊で合格する',
  officialTargetCount: 4045,
  printedRowCount: records.length,
  usableRecords: records.filter((r) => r.studyReady).length,
  notes: [
    'autoAccepted records use the best available dictionary candidate and should be treated as practical study data, not source-verified transcription.',
    'Examples labeled template-draft are available for immediate study but require later naturalness review.',
    'missing records have no reliable candidate and are retained so printed numbering remains complete.',
  ],
  records,
};
await fs.writeFile('data/vocab-study-fast.json', `${JSON.stringify(output, null, 2)}\n`);

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join(' | ') : value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const headers = ['id','day','printedNumber','status','studyReady','kanjiOrExpression','reading','meanings','partsOfSpeech','dictionaryId','exampleStatus','examples'];
const lines = [headers, ...records.map((r) => [r.id,r.day,r.printedNumber,r.status,r.studyReady,r.kanjiOrExpression,r.reading,r.meanings,r.partsOfSpeech,r.dictionaryId,r.exampleStatus,r.examples.map((e) => `${e.ja} / ${e.en}`)])];
await fs.writeFile('data/vocab-study-fast.csv', `${lines.map((line) => line.map(csvEscape).join(',')).join('\n')}\n`);

console.log(JSON.stringify({
  total: records.length,
  verified: records.filter((r) => r.status === 'verified').length,
  autoAccepted: records.filter((r) => r.status === 'autoAccepted').length,
  missing: records.filter((r) => r.status === 'missing').length,
  withExamples: records.filter((r) => r.examples.length === 2).length,
}, null, 2));
