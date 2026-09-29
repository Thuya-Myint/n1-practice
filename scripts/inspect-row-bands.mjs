import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const source = process.argv[2];
const { data, info } = await sharp(source).grayscale().raw().toBuffer({ resolveWithObject: true });
const side = process.argv[3] ?? 'left';
const x0 = side === 'right' ? 400 : 45;
const x1 = side === 'right' ? 475 : 135;
const bands = [];
let inBand = false, start = 0;
for (let y = 220; y < 1120; y += 1) {
  let dark = 0;
  for (let x = x0; x < x1; x += 1) if (data[y * info.width + x] < 90) dark += 1;
  if (dark >= 3 && !inBand) { start = y; inBand = true; }
  if ((dark < 3 || y === 1119) && inBand) {
    if (y - start >= 2) bands.push({ start, end: y - 1 });
    inBand = false;
  }
}
console.log(JSON.stringify(bands, null, 2));
