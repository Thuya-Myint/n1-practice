// Extract numbered, printed model sentences (not drill questions) from the
// successful Vision OCR. This works from paragraph geometry, omitting furigana.
import fs from 'node:fs/promises';
import path from 'node:path';

const inputRoot = path.resolve('data/grammar-cloud-ocr');
const output = path.resolve('data/grammar-model-sentences.json');
const bounds = (vertices = []) => {
  const xs = vertices.map((point) => point.x ?? 0); const ys = vertices.map((point) => point.y ?? 0);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};
const textOf = (paragraph) => paragraph.words.map((word) => word.symbols.map((symbol) => symbol.text).join('')).join('');

const pages = [];
for (const document of ['a', 'hir-fie']) {
  for (const file of (await fs.readdir(path.join(inputRoot, document))).sort()) {
    const json = JSON.parse(await fs.readFile(path.join(inputRoot, document, file), 'utf8'));
    const visionPage = json.response.responses?.[0]?.fullTextAnnotation?.pages?.[0];
    const raw = visionPage?.blocks.flatMap((block) => block.paragraphs ?? []).map((paragraph) => {
      const box = bounds(paragraph.boundingBox?.vertices);
      const symbolHeights = paragraph.words.flatMap((word) => word.symbols ?? []).map((symbol) => {
        const symbolBox = bounds(symbol.boundingBox?.vertices); return symbolBox.bottom - symbolBox.top;
      }).sort((a, b) => a - b);
      return { text: textOf(paragraph), ...box, height: symbolHeights[Math.floor(symbolHeights.length / 2)] ?? 0 };
    }).filter((line) => line.text && line.height >= 40) ?? [];
    const drillY = raw.find((line) => /ドリル/.test(line.text))?.top ?? Infinity;
    const lines = raw.filter((line) => line.top < drillY && !/^(●|注|※|前には|後には|いっしょ|似ている|「|[〜~]|N[＋+]|V[＋+])/.test(line.text));
    const candidates = [];
    for (const line of lines.filter((item) => /^\d+[　 ]*/.test(item.text) && !/^\d+(前に|後に|「|\[)/.test(item.text)).sort((a, b) => a.top - b.top)) {
      let sentence = line.text.replace(/^\d+[　 ]*/, '');
      let bottom = line.bottom;
      const column = line.left;
      for (const continuation of lines.filter((item) => !/[。！？]$/.test(sentence) && item.top > bottom - 5 && item.top - bottom < 210 && Math.abs(item.left - column) < 180).sort((a, b) => a.top - b.top)) {
        if (/^\d+[　 ]*/.test(continuation.text)) break;
        sentence += continuation.text;
        bottom = continuation.bottom;
        if (/[。！？]$/.test(sentence)) break;
      }
      sentence = sentence.replace(/\s+/g, '').replace(/([。！？])\*.*$/, '$1');
      if (sentence.length >= 8 && /[。！？]$/.test(sentence) && !candidates.some((item) => item.text === sentence)) candidates.push({ text: sentence, y: line.top });
    }
    pages.push({ document, page: json.page, examples: candidates });
  }
}
await fs.writeFile(output, `${JSON.stringify({ schemaVersion: 1, pages }, null, 2)}\n`);
console.log(`Wrote ${pages.reduce((sum, page) => sum + page.examples.length, 0)} candidate source examples across ${pages.length} pages.`);
