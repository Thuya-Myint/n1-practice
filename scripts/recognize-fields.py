"""Recognize word and reading field crops for cross-checking line OCR."""

import json
from pathlib import Path

from paddleocr import TextRecognition

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "row-manifest.json"
OUTPUT = ROOT / "data" / "recognition-fields.json"
BATCH_SIZE = 32


def unpack(result):
    value = result.json
    if isinstance(value, str):
        value = json.loads(value)
    value = value.get("res", value)
    return {"text": str(value.get("rec_text", "")).strip(), "confidence": float(value.get("rec_score", 0))}


records = json.loads(MANIFEST.read_text(encoding="utf-8"))["records"]
model = TextRecognition(model_name="japan_PP-OCRv3_mobile_rec")
output = {record["id"]: {} for record in records}
for field in ("word", "reading"):
    for start in range(0, len(records), BATCH_SIZE):
        batch = records[start : start + BATCH_SIZE]
        images = [str(ROOT / record["crops"][field]) for record in batch]
        results = list(model.predict(images, batch_size=BATCH_SIZE))
        if len(results) != len(batch):
            raise RuntimeError(f"OCR batch {field}/{start} is incomplete")
        for record, result in zip(batch, results):
            output[record["id"]][field] = unpack(result)
        print(f"{field} {min(start + len(batch), len(records))}/{len(records)}", flush=True)

OUTPUT.write_text(json.dumps({"schemaVersion": 1, "engine": "PaddleOCR japan_PP-OCRv3_mobile_rec", "records": output}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUTPUT}")
