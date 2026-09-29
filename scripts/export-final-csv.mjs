import fs from 'node:fs';

const input = JSON.parse(fs.readFileSync('data/vocab-final-merged.json', 'utf8'));
const rows = input.records;
const cols = ['id', 'day', 'printedNumber', 'status', 'kanjiOrExpression', 'reading', 'meaning'];
const esc = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const out = [cols.join(',')];
for (const row of rows) {
  const meaning = row.meanings?.[0]?.gloss ?? row.meaning ?? '';
  out.push(cols.map((col) => esc(col === 'meaning' ? meaning : row[col])).join(','));
}
fs.writeFileSync('data/vocab-final-merged.csv', `${out.join('\n')}\n`);
console.log(JSON.stringify({ rows: rows.length, path: 'data/vocab-final-merged.csv' }));
