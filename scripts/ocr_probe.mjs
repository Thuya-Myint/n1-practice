import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createWorker } = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/tesseract.js');
const sharp = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const image = process.argv[2];
if (!image) throw new Error('image path required');
const worker = await createWorker('jpn', 1, {
  logger: m => { if (m.status === 'recognizing text') console.log(`${Math.round((m.progress || 0) * 100)}%`); }
});
const processed = await sharp(path.resolve(image))
  .resize({ width: 1800 })
  .grayscale()
  .normalize()
  .sharpen()
  .png()
  .toBuffer();
const result = await worker.recognize(processed);
console.log(result.data.text);
await worker.terminate();
