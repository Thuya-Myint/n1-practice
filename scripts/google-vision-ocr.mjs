// Upload the supplied page photos to Google Cloud Vision OCR.
// Results are resumable and saved locally; the photos are not copied into the repository.
import fs from 'node:fs/promises';
import path from 'node:path';

const sourceDir = 'C:/Users/tthuy/Downloads/Telegram Desktop';
const outDir = path.resolve('data/cloud-ocr');
const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
if (!apiKey) {
  throw new Error('Set GOOGLE_CLOUD_VISION_API_KEY before running this script.');
}

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
    if (existing.provider === 'google-cloud-vision' && existing.httpStatus === 200 && !existing.response?.error) {
      console.log(`skip ${file.number}: already saved`);
      continue;
    }
  } catch {}

  const image = (await fs.readFile(file.path)).toString('base64');
  let saved = false;
  for (let attempt = 1; attempt <= 5 && !saved; attempt += 1) {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ja'] },
        }],
      }),
    });
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 5) {
      const waitMs = Math.min(60000, 5000 * 2 ** (attempt - 1));
      console.log(`temporary error on ${file.number} (HTTP ${response.status}); retrying in ${waitMs / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    await fs.writeFile(output, `${JSON.stringify({
      provider: 'google-cloud-vision',
      photo: file.number,
      source: file.path,
      httpStatus: response.status,
      response: parsed,
    }, null, 2)}\n`, 'utf8');
    console.log(`uploaded ${file.number}/${files.length}: HTTP ${response.status}`);
    saved = true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!saved) throw new Error(`Could not upload photo ${file.number} after retries`);
}
