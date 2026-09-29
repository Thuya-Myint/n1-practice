import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { createWorker } = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/tesseract.js');
const sharp = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const sourceDir = 'C:/Users/tthuy/Downloads/Telegram Desktop';
const outputDir = path.resolve('data/ocr-columns');
await fs.mkdir(outputDir, { recursive: true });

const files = (await fs.readdir(sourceDir))
  .filter(name => /^photo_\d+_.*\.jpg$/i.test(name))
  .sort((a, b) => Number(a.match(/^photo_(\d+)/i)[1]) - Number(b.match(/^photo_(\d+)/i)[1]));

const worker = await createWorker('jpn', 1, {
  logger: m => {
    if (m.status === 'recognizing text' && m.progress > 0.99) process.stdout.write('.');
  }
});
await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });

const manifest = [];
const seenHashes = new Set();
let uniqueIndex = 0;
for (let i = 0; i < files.length; i += 1) {
  const file = files[i];
  const id = file.match(/^photo_(\d+)/i)[1];
  const sourceBuffer = await fs.readFile(path.join(sourceDir, file));
  const hash = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
  const duplicateOf = seenHashes.has(hash) ? manifest.find(page => page.sha256 === hash)?.source ?? null : null;
  seenHashes.add(hash);
  const output = path.join(outputDir, `photo_${id}.txt`);
  let text;
  try {
    text = (await fs.readFile(output, 'utf8'));
  } catch {
    const metadata = await sharp(sourceBuffer).metadata();
    const width = metadata.width ?? 720;
    const height = metadata.height ?? 1280;
    const columnWidth = Math.floor(width / 2);
    const texts = [];
    for (const left of [0, columnWidth]) {
      const processed = await sharp(sourceBuffer)
        .extract({ left, top: Math.floor(height * 0.10), width: left === 0 ? columnWidth : width - columnWidth, height: Math.floor(height * 0.82) })
        .resize({ width: 1050 })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
      const result = await worker.recognize(processed);
      texts.push(result.data.text);
    }
    text = texts.join('\n');
    await fs.writeFile(output, text, 'utf8');
  }
  const day = duplicateOf ? null : Math.floor(uniqueIndex / 2) + 1;
  if (!duplicateOf) uniqueIndex += 1;
  const range = text.match(/([0-9]{1,4})\s*[~～-]\s*([0-9]{1,4})/)?.slice(1) ?? [];
  manifest.push({ source: file, ocr: path.relative(process.cwd(), output).replaceAll('\\\\', '/'), day, pageInDay: duplicateOf ? null : ((uniqueIndex - 1) % 2) + 1, duplicateOf, sha256: hash, range: range.length === 2 ? range : null });
  console.log(` ${i + 1}/${files.length} ${file} day=${day ?? '?'} range=${range.join('-') || '?'}`);
}
await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({ sourceDir, count: files.length, pages: manifest }, null, 2));
await worker.terminate();
console.log(`done: ${files.length} pages`);
