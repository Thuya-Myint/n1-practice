import json
import sys

from paddleocr import TextRecognition

image_path = sys.argv[1]
model = TextRecognition(model_name="japan_PP-OCRv3_mobile_rec")
for result in model.predict(image_path):
    print(json.dumps(result.json, ensure_ascii=False, indent=2))
