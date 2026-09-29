import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const [image, left, top, width, height, output] = process.argv.slice(2);
await sharp(path.resolve(image)).extract({ left: Number(left), top: Number(top), width: Number(width), height: Number(height) }).resize({ width: 900 }).png().toFile(path.resolve(output));
