"""Recognize word and reading crops generated from the scanned PDFs."""
import json
from pathlib import Path
from paddleocr import TextRecognition

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data' / 'row-manifest-pdf.json'
OUTPUT = ROOT / 'data' / 'recognition-pdf-fields.json'
records = json.loads(MANIFEST.read_text(encoding='utf-8'))['records']
model = TextRecognition(model_name='japan_PP-OCRv3_mobile_rec')

def unpack(result):
    value = result.json
    if isinstance(value, str): value = json.loads(value)
    value = value.get('res', value)
    return {'text': str(value.get('rec_text', '')).strip(), 'confidence': float(value.get('rec_score', 0))}

output = {r['id']: {} for r in records}
for field in ('word', 'reading'):
    for start in range(0, len(records), 32):
        batch = records[start:start + 32]
        results = list(model.predict([str(ROOT / r['crops'][field]) for r in batch], batch_size=32))
        for record, result in zip(batch, results): output[record['id']][field] = unpack(result)
        print(f'{field} {min(start + len(batch), len(records))}/{len(records)}', flush=True)
OUTPUT.write_text(json.dumps({'schemaVersion': 1, 'engine': 'PaddleOCR japan_PP-OCRv3_mobile_rec', 'records': output}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'wrote {OUTPUT}')
