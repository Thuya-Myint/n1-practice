// OCR the two supplied grammar PDFs after they have been rendered to JPEG pages.
// It is resumable: pages with a successful saved response are never billed again.
import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
if (!apiKey) throw new Error('Set GOOGLE_CLOUD_VISION_API_KEY in this PowerShell window before running this script.');

const sources = [
  { id: 'a', directory: path.resolve('tmp/pdfs/a') },
  { id: 'hir-fie', directory: path.resolve('tmp/pdfs/b') },
];
const outputRoot = path.resolve('data/grammar-cloud-ocr');

for (const source of sources) {
  const outputDirectory = path.join(outputRoot, source.id);
  await fs.mkdir(outputDirectory, { recursive: true });
  const files = (await fs.readdir(source.directory))
    .filter((name) => /^page-\d+\.jpg$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length !== 24) throw new Error(`${source.id}: expected 24 rendered pages, found ${files.length}.`);

  for (const [index, file] of files.entries()) {
    const page = index + 1;
    const output = path.join(outputDirectory, `page-${String(page).padStart(2, '0')}.json`);
    try {
      const existing = JSON.parse(await fs.readFile(output, 'utf8'));
      if (existing.httpStatus === 200 && !existing.response?.error) {
        console.log(`${source.id} ${page}/24: already saved`);
        continue;
      }
    } catch {}

    const content = (await fs.readFile(path.join(source.directory, file))).toString('base64');
    let completed = false;
    for (let attempt = 1; attempt <= 5 && !completed; attempt += 1) {
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['ja'] },
          }],
        }),
      });
      const raw = await response.text();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 5) {
        const waitMs = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
        console.log(`${source.id} ${page}/24: temporary HTTP ${response.status}; retrying in ${waitMs / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      await fs.writeFile(output, `${JSON.stringify({
        provider: 'google-cloud-vision',
        document: source.id,
        page,
        source: file,
        httpStatus: response.status,
        response: parsed,
      }, null, 2)}\n`);
      console.log(`${source.id} ${page}/24: HTTP ${response.status}`);
      completed = true;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    if (!completed) throw new Error(`${source.id} page ${page}: unable to get a response after retries.`);
  }
}
