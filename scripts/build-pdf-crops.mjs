import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const old = JSON.parse(await fs.readFile('data/row-manifest.json', 'utf8'));
const sourceDir = path.resolve('tmp/pdf-pages');
const outputDir = path.resolve('data/pdf-rows');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
const pdfFiles = [];
for (const part of ['n1-part1', 'n1-part2', 'n1-part3', 'n1-part4']) {
  const names = (await fs.readdir(sourceDir)).filter((n) => n.startsWith(`${part}-`) && n.endsWith('.jpg'))
    .sort((a, b) => Number(a.match(/-(\d+)\.jpg$/)[1]) - Number(b.match(/-(\d+)\.jpg$/)[1]));
  pdfFiles.push(...names.map((name) => path.join(sourceDir, name)));
}
if (pdfFiles.length !== 83) throw new Error(`Expected 83 rendered PDF pages, found ${pdfFiles.length}`);
const metadata = await Promise.all(pdfFiles.map((file) => sharp(file).metadata()));
const records = [];
for (const row of old.records) {
  const index = row.source.photo - 1;
  const file = pdfFiles[index];
  const meta = metadata[index];
  const sx = meta.width / 720;
  const sy = meta.height / 1280;
  const side = row.source.side;
  const baseX = side === 'left' ? 46 : 388;
  const widths = { word: side === 'left' ? 77 : 96, reading: side === 'left' ? 140 : 160, line: side === 'left' ? 220 : 260 };
  const lefts = { word: side === 'left' ? 48 : 390, reading: side === 'left' ? 124 : 485, line: baseX };
  const top = Math.max(0, Math.round(row.source.y * sy - 4 * sy));
  const height = Math.min(meta.height - top, Math.round(42 * sy));
  const stem = `photo-${String(row.source.photo).padStart(2, '0')}-n-${String(row.printedNumber).padStart(3, '0')}`;
  const crops = {};
  await Promise.all(['word', 'reading', 'line'].map(async (kind) => {
    const out = path.join(outputDir, `${stem}-${kind}.png`);
    await sharp(file).extract({ left: Math.round(lefts[kind] * sx), top, width: Math.round(widths[kind] * sx), height })
      .resize({ width: Math.round(widths[kind] * sx * 2), height: Math.round(height * 2) })
      .grayscale().normalise().sharpen().png().toFile(out);
    crops[kind] = path.relative(process.cwd(), out).replaceAll('\\', '/');
  }));
  records.push({ ...row, source: { ...row.source, path: file.replaceAll('\\', '/') }, crops });
}
await fs.writeFile('data/row-manifest-pdf.json', `${JSON.stringify({ schemaVersion: 1, source: 'four scanned PDFs', records }, null, 2)}\n`);
console.log(JSON.stringify({ records: records.length, crops: records.length * 3, pages: pdfFiles.length }, null, 2));
