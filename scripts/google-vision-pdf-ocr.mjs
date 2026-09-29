// Upload all rendered PDF pages to Google Cloud Vision DOCUMENT_TEXT_DETECTION.
// Resumable: successful pages are skipped on later runs.
import fs from 'node:fs/promises';
import path from 'node:path';

const sourceDir = path.resolve('tmp/pdf-pages');
const outDir = path.resolve('data/pdf-cloud-ocr');
const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
if (!apiKey) throw new Error('Set GOOGLE_CLOUD_VISION_API_KEY before running this script.');
await fs.mkdir(outDir, { recursive: true });
const files = (await fs.readdir(sourceDir)).filter((n) => n.endsWith('.jpg')).sort((a, b) => {
  const order = (n) => { const m = n.match(/n1-part(\d+)-(\d+)\.jpg/); return Number(m[1]) * 100 + Number(m[2]); };
  return order(a) - order(b);
});
if (files.length !== 83) throw new Error(`Expected 83 rendered PDF pages, found ${files.length}`);

for (let index = 0; index < files.length; index += 1) {
  const file = files[index];
  const output = path.join(outDir, `page-${String(index + 1).padStart(2, '0')}.json`);
  try {
    const existing = JSON.parse(await fs.readFile(output, 'utf8'));
    if (existing.httpStatus === 200 && !existing.response?.error) { console.log(`skip ${index + 1}: already saved`); continue; }
  } catch {}
  const content = (await fs.readFile(path.join(sourceDir, file))).toString('base64');
  let saved = false;
  for (let attempt = 1; attempt <= 5 && !saved; attempt += 1) {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['ja'] } }] }),
    });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    if ([429,500,502,503,504].includes(response.status) && attempt < 5) {
      const wait = Math.min(60000, 5000 * 2 ** (attempt - 1));
      console.log(`temporary error page ${index + 1}; retrying in ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait)); continue;
    }
    await fs.writeFile(output, `${JSON.stringify({ provider: 'google-cloud-vision', page: index + 1, source: file, httpStatus: response.status, response: parsed }, null, 2)}\n`);
    console.log(`uploaded ${index + 1}/83: HTTP ${response.status}`);
    saved = true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!saved) throw new Error(`Could not upload PDF page ${index + 1}`);
}
