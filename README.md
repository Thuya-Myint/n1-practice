# N1 Practice

A focused JLPT N1 vocabulary study app built with Next.js.

It includes 2,460 verified vocabulary entries, lesson-by-lesson review,
random review, a multiple-choice exam mode, furigana and translation toggles,
and progress saved locally in the browser.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production check

```bash
npm run build
```

The repository intentionally includes only `data/vocab-final-study.json`, the
final runtime dataset. Raw scan images, OCR output, downloaded dictionaries,
and local API configuration remain excluded.
