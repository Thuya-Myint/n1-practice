// Upload the supplied page photos to OCR.space's Japanese OCR engine.
// Run with --limit 1 first, then the full set. Results are resumable and saved
// locally; the photos themselves are not copied into the repository.
import fs from 'node:fs/promises';
import path from 'node:path';

const sourceDir = 'C:/Users/tthuy/Downloads/Telegram Desktop';
const outDir = path.resolve('data/cloud-ocr');
const apiKey = process.env.OCR_SPACE_API_KEY || 'helloworld';
await fs.mkdir(outDir, { recursive: true });
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const files = (await fs.readdir(sourceDir))
  .map((name) => ({ name, match: /^photo_(\d+)_.*\.jpg$/i.exec(name) }))
  .filter(({ match }) => match)
  .map(({ name, match }) => ({ number: Number(match[1]), name, path: path.join(sourceDir, name) }))
  .sort((a, b) => a.number - b.number)
  .slice(0, limit);

for (const file of files) {
  const output = path.join(outDir, `photo-${String(file.number).padStart(2, '0')}.json`);
  try {
    const existing = JSON.parse(await fs.readFile(output, 'utf8'));
    if (existing.httpStatus === 200 && existing.response?.OCRExitCode === 1) {
      console.log(`skip ${file.number}: already saved`);
      continue;
    }
  } catch {}
  let saved = false;
  for (let attempt = 1; attempt <= 4 && !saved; attempt += 1) {
    const body = new FormData();
    body.append('language', 'jpn');
    body.append('OCREngine', '3');
    body.append('isOverlayRequired', 'true');
    body.append('file', new Blob([await fs.readFile(file.path)], { type: 'image/jpeg' }), file.name);
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: apiKey },
      body,
    });
    const text = await response.text();
    const parsed = JSON.parse(text);
    if (response.status === 429) {
      console.log(`rate limited on ${file.number}; waiting before retry ${attempt}/4`);
      await new Promise((resolve) => setTimeout(resolve, 60000));
      continue;
    }
    await fs.writeFile(output, `${JSON.stringify({ photo: file.number, source: file.path, httpStatus: response.status, response: parsed }, null, 2)}\n`, 'utf8');
    console.log(`uploaded ${file.number}/${files.length}: HTTP ${response.status}`);
    saved = true;
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }
  if (!saved) throw new Error(`Could not upload photo ${file.number} after retries`);
}
