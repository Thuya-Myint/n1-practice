// OCR the two new retake scans with Google Cloud Vision. Safe to rerun: pages
// returning HTTP 200 are retained and never submitted again.
import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
if (!apiKey) throw new Error('Set GOOGLE_CLOUD_VISION_API_KEY in this PowerShell window before running this script.');

const sources = [
  { id: 'retake-f3', directory: path.resolve('tmp/pdfs/retake-f3') },
  { id: 'retake-second', directory: path.resolve('tmp/pdfs/retake-second') },
  { id: 'clear-missing', directory: path.resolve('tmp/pdfs/clear-missing') },
];
const outputRoot = path.resolve('data/grammar-retake-ocr');

for (const source of sources) {
  const files = (await fs.readdir(source.directory)).filter((file) => /^page-\d+\.jpg$/i.test(file)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!files.length) throw new Error(`${source.id}: no rendered JPEG pages found in ${source.directory}`);
  const outputDirectory = path.join(outputRoot, source.id);
  await fs.mkdir(outputDirectory, { recursive: true });

  for (const [index, file] of files.entries()) {
    const page = index + 1;
    const outputPath = path.join(outputDirectory, `page-${String(page).padStart(2, '0')}.json`);
    try {
      const previous = JSON.parse(await fs.readFile(outputPath, 'utf8'));
      if (previous.httpStatus === 200 && !previous.response?.error) {
        console.log(`${source.id} ${page}/${files.length}: already saved`);
        continue;
      }
    } catch {}

    const content = (await fs.readFile(path.join(source.directory, file))).toString('base64');
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['ja'] } }] }),
    });
    const raw = await response.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
    await fs.writeFile(outputPath, `${JSON.stringify({ provider: 'google-cloud-vision', document: source.id, page, source: file, httpStatus: response.status, response: parsed }, null, 2)}\n`);
    console.log(`${source.id} ${page}/${files.length}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}
