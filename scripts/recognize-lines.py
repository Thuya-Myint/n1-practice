"""Recognize isolated printed vocabulary rows with PaddleOCR.

This intentionally writes raw, attributable OCR rather than pretending OCR is
authoritative.  `validate-vocabulary.mjs` performs a separate dictionary match.
"""

import json
import os
import sys
from pathlib import Path

from paddleocr import TextRecognition

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "row-manifest.json"
OUTPUT = ROOT / "data" / "recognition-lines.json"
BATCH_SIZE = 32


def result_data(result):
    data = result.json
    # PaddleOCR returns a JSON-ready dictionary on current releases.  Retain a
    # defensive branch so an update cannot silently corrupt the output.
    if isinstance(data, str):
        data = json.loads(data)
    # TextRecognition returns `{ "res": { ... } }` in PaddleOCR 3.x.
    # Keep compatibility with the flatter result shape used by older releases.
    data = data.get("res", data)
    return {
        "text": str(data.get("rec_text", "")).strip(),
        "confidence": float(data.get("rec_score", 0)),
    }


manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
records = manifest["records"]
model = TextRecognition(model_name="japan_PP-OCRv3_mobile_rec")
recognized = []

for start in range(0, len(records), BATCH_SIZE):
    batch = records[start : start + BATCH_SIZE]
    images = [str(ROOT / record["crops"]["line"]) for record in batch]
    results = list(model.predict(images, batch_size=BATCH_SIZE))
    if len(results) != len(batch):
        raise RuntimeError(f"OCR batch {start} returned {len(results)} results for {len(batch)} inputs")
    for record, result in zip(batch, results):
        recognized.append({
            "id": record["id"],
            "rawLineOcr": result_data(result),
            "source": record["source"],
        })
    print(f"recognized {min(start + len(batch), len(records))}/{len(records)}", flush=True)

payload = {
    "schemaVersion": 1,
    "engine": "PaddleOCR japan_PP-OCRv3_mobile_rec",
    "records": recognized,
}
OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUTPUT} ({len(recognized)} records)")
