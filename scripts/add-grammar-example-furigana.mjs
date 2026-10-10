import fs from 'node:fs/promises';
import KuroshiroModule from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';

const inputPath = 'data/grammar-study.json';
const study = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const Kuroshiro = KuroshiroModule.default;
const kuroshiro = new Kuroshiro();
await kuroshiro.init(new KuromojiAnalyzer());

let annotated = 0;
for (const entry of study.entries) {
  entry.sourceExamples = await Promise.all((entry.sourceExamples ?? []).map(async (example) => {
    const ja = typeof example === 'string' ? example : example.ja;
    const furigana = await kuroshiro.convert(ja, {
      mode: 'furigana', to: 'hiragana', delimiter_start: '<ruby>', delimiter_end: '</ruby>', ruby_start: '<rt>', ruby_end: '</rt>'
    });
    annotated += 1;
    return { ja, furigana };
  }));
}
study.furigana = { format: 'HTML ruby markup in entries[].sourceExamples[].furigana', generatedWith: 'Kuroshiro + Kuromoji' };
await fs.writeFile(inputPath, `${JSON.stringify(study, null, 2)}\n`);
console.log(JSON.stringify({ inputPath, examplesAnnotated: annotated }));
