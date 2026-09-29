import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/tthuy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const sourceDir = 'C:/Users/tthuy/Downloads/Telegram Desktop';
const outputDir = path.resolve('data/rows');
const manifestPath = path.resolve('data/row-manifest.json');

const files = (await fs.readdir(sourceDir))
  .map((name) => ({ name, match: /^photo_(\d+)_.*\.jpg$/i.exec(name) }))
  .filter(({ match }) => match)
  .map(({ name, match }) => ({ number: Number(match[1]), name, path: path.join(sourceDir, name) }))
  .sort((a, b) => a.number - b.number);

if (files.length !== 83 || files.some((file, index) => file.number !== index + 1)) {
  throw new Error(`Expected photo_1 through photo_83 once each; found ${files.length} files.`);
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

/**
 * Coordinate templates are deliberately conservative: the word and reading are
 * cropped separately, excluding the handwritten notes that sit to the far right.
 * All source photos are 720 × 1280, shot from the same book layout.
 */
const template = {
  standardFirst: { rows: 23, left: 1, right: 24 },
  standardSecond: { rows: 27, left: 47, right: 74 },
  day40First: { rows: 23, left: 1, right: 24 },
  // Photo 80 is the left page only (47–73). Photo 81 continues at 74.
  day40Second: { rows: 27, left: 47, right: null },
  day41First: { rows: 23, left: 1, right: null },
  day41Second: { rows: 27, left: 24, right: null },
};

function pageSpec(number) {
  if (number <= 78) {
    const day = Math.ceil(number / 2);
    return { day, part: number % 2 ? 'first' : 'second', template: number % 2 ? template.standardFirst : template.standardSecond };
  }
  if (number === 79) return { day: 40, part: 'first', template: template.day40First };
  if (number === 80) return { day: 40, part: 'second', template: template.day40Second };
  if (number === 81) return { day: 40, part: 'third', template: { rows: 26, left: 74, right: null } };
  if (number === 82) return { day: 41, part: 'first', template: template.day41First };
  return { day: 41, part: 'second', template: template.day41Second };
}

const crops = {
  // The standard pages have handwritten translations beyond x≈270.  The line
  // crop ends before that region; it is what the recognizer sees.
  left: {
    word: { left: 48, width: 77 },
    reading: { left: 124, width: 140 },
    line: { left: 46, width: 220 },
  },
  right: {
    word: { left: 390, width: 96 },
    reading: { left: 485, width: 160 },
    line: { left: 388, width: 260 },
  },
};

async function textBands(imagePath, side) {
  const scan = side === 'left' ? { left: 45, width: 90 } : { left: 400, width: 75 };
  const { data, info } = await sharp(imagePath).grayscale().raw().toBuffer({ resolveWithObject: true });
  const bands = [];
  let active = false;
  let start = 0;
  let quietRows = 0;
  for (let y = 190; y < Math.min(info.height - 10, 1140); y += 1) {
    let dark = 0;
    for (let x = scan.left; x < scan.left + scan.width; x += 1) {
      if (data[y * info.width + x] < 90) dark += 1;
    }
    if (dark >= 3) {
      if (!active) { start = y; active = true; }
      quietRows = 0;
    } else if (active) {
      quietRows += 1;
      if (quietRows >= 3 || y === 1139) {
        const end = y - quietRows;
        if (end - start >= 5) bands.push({ start, end });
        active = false;
        quietRows = 0;
      }
    }
  }
  return bands;
}

function chooseRows(bands, expected, label) {
  if (bands.length < 2) throw new Error(`${label}: detected only ${bands.length} row bands.`);
  if (bands.length < expected) {
    // A faint character or handwritten overlap can hide a band.  Keep the
    // detected first/last baselines and interpolate only the missing positions;
    // this is still much more accurate than one fixed coordinate template.
    const first = bands[0].start;
    const last = bands.at(-1).start;
    const heights = bands.map((band) => band.end - band.start + 1).sort((a, b) => a - b);
    const height = heights[Math.floor(heights.length / 2)];
    return Array.from({ length: expected }, (_, index) => {
      const start = Math.round(first + (last - first) * index / (expected - 1));
      return { start, end: start + height - 1, interpolated: true };
    });
  }
  // First pages occasionally yield one header band before item 1. Keeping the
  // final expected bands removes that header while preserving a continuation
  // page, whose detected count already equals its printed row count.
  return bands.slice(-expected);
}

const records = [];
for (const file of files) {
  const spec = pageSpec(file.number);
  const bandsBySide = {};
  for (const side of ['left', 'right']) {
    if (!spec.template[side]) continue;
    const detected = await textBands(file.path, side);
    // First pages have a heading and sometimes a “memorize this” banner above
    // item 1. Continuation pages begin directly with their numbered rows.
    const content = spec.part === 'first' ? detected.filter((band) => band.start >= 240) : detected;
    bandsBySide[side] = chooseRows(content, spec.template.rows, `photo ${file.number} ${side}`);
  }
  for (const side of ['left', 'right']) {
    const initial = spec.template[side];
    if (!initial) continue;
    for (let offset = 0; offset < spec.template.rows; offset += 1) {
      const printedNumber = initial + offset;
      // The book ends Day 40 at 99 and Day 41 at 50.
      if ((spec.day === 40 && printedNumber > 99) || (spec.day === 41 && printedNumber > 50)) continue;
      const y = Math.max(0, bandsBySide[side][offset].start - 5);
      const stem = `photo-${String(file.number).padStart(2, '0')}-n-${String(printedNumber).padStart(3, '0')}`;
      const cropTargets = [];
      for (const kind of ['word', 'reading', 'line']) {
        const x = crops[side][kind];
        const target = path.join(outputDir, `${stem}-${kind}.png`);
        const lineHeight = Math.max(30, bandsBySide[side][offset].end - bandsBySide[side][offset].start + 11);
        cropTargets.push(
          sharp(file.path)
            .extract({ left: x.left, top: y, width: x.width, height: lineHeight })
            .resize({ width: x.width * 5, height: lineHeight * 5 })
            .grayscale()
            .normalise()
            .sharpen()
            .png()
            .toFile(target),
        );
      }
      await Promise.all(cropTargets);
      records.push({
        id: `d${String(spec.day).padStart(2, '0')}-${String(printedNumber).padStart(3, '0')}`,
        day: spec.day,
        printedNumber,
        source: { photo: file.number, path: file.path.replaceAll('\\', '/'), side, x: side === 'left' ? 48 : 390, y, height: 30 },
        crops: {
          word: path.relative(process.cwd(), path.join(outputDir, `${stem}-word.png`)).replaceAll('\\', '/'),
          reading: path.relative(process.cwd(), path.join(outputDir, `${stem}-reading.png`)).replaceAll('\\', '/'),
          line: path.relative(process.cwd(), path.join(outputDir, `${stem}-line.png`)).replaceAll('\\', '/'),
        },
        extractionStatus: 'pending-recognition',
      });
    }
  }
}

await fs.writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, expectedTargets: 4045, records }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ records: records.length, manifest: manifestPath }, null, 2));
