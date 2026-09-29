import json
import sys

from paddleocr import PaddleOCR

image_path = sys.argv[1]
ocr = PaddleOCR(
    lang="japan",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    text_detection_model_name="PP-OCRv5_mobile_det",
    text_recognition_model_name="japan_PP-OCRv3_mobile_rec",
)
for result in ocr.predict(image_path):
    payload = result.json
    print(json.dumps(payload, ensure_ascii=False, indent=2))
