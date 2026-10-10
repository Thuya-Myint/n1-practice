// Reconstruct the large, printed Japanese text lines from Vision's positioned OCR.
// Furigana is deliberately excluded: it occupies separate, much smaller word boxes.
import fs from 'node:fs/promises';
import path from 'node:path';

const inputRoot = path.resolve('data/grammar-cloud-ocr');
const outputRoot = path.resolve('data/grammar-source-lines');
await fs.mkdir(outputRoot, { recursive: true });

const bounds = (vertices = []) => {
  const xs = vertices.map((point) => point.x ?? 0);
  const ys = vertices.map((point) => point.y ?? 0);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};
const textOf = (word) => word.symbols.map((symbol) => symbol.text).join('');

for (const document of ['a', 'hir-fie']) {
  const documentDirectory = path.join(inputRoot, document);
  const result = [];
  for (const file of (await fs.readdir(documentDirectory)).sort()) {
    const json = JSON.parse(await fs.readFile(path.join(documentDirectory, file), 'utf8'));
    const page = json.response.responses?.[0]?.fullTextAnnotation?.pages?.[0];
    const words = page?.blocks.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.words ?? []) ?? [];
    const measured = words.map((word) => {
      const box = bounds(word.boundingBox?.vertices);
      return { text: textOf(word), ...box, height: box.bottom - box.top, centerY: (box.top + box.bottom) / 2 };
    }).filter((word) => word.text && word.height >= 22);

    // Baseline grouping handles the slight camera rotation in the scanned spreads.
    const rows = [];
    for (const word of measured.sort((a, b) => a.centerY - b.centerY || a.left - b.left)) {
      const row = rows.find((candidate) => Math.abs(candidate.centerY - word.centerY) <= Math.max(13, Math.min(25, word.height * 0.5)));
      if (row) {
        row.words.push(word);
        row.centerY = row.words.reduce((sum, item) => sum + item.centerY, 0) / row.words.length;
      } else rows.push({ centerY: word.centerY, words: [word] });
    }

    result.push({
      page: json.page,
      lines: rows.map((row) => ({
        y: Math.round(row.centerY),
        text: row.words.sort((a, b) => a.left - b.left).map((word) => word.text).join(''),
        height: Math.round(row.words.reduce((sum, word) => sum + word.height, 0) / row.words.length),
      })).filter((line) => /[一-龯ぁ-んァ-ヶ]/.test(line.text)),
    });
  }
  await fs.writeFile(path.join(outputRoot, `${document}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${document}: ${result.length} OCR pages`);
}
