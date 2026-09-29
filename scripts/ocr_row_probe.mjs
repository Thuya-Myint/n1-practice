import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createWorker } = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/tesseract.js');
const sharp = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const [image, left, top, width, height] = process.argv.slice(2);
const crop = await sharp(path.resolve(image))
  .extract({ left: Number(left), top: Number(top), width: Number(width), height: Number(height) })
  .resize({ width: 1500 })
  .grayscale()
  .normalize()
  .sharpen()
  .png()
  .toBuffer();
const worker = await createWorker('jpn', 1, { langPath: path.resolve('data/tessdata-best') });
await worker.setParameters({ tessedit_pageseg_mode: '8', preserve_interword_spaces: '1' });
const result = await worker.recognize(crop);
console.log(result.data.text.trim());
await worker.terminate();
