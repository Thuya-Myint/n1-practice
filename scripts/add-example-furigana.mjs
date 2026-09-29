import fs from 'node:fs';
import KuroshiroModule from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';

const args = process.argv.slice(2);
const valueOf = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const inputPath = valueOf('--input') ?? 'data/vocab-final-study.json';
const outputPath = valueOf('--output') ?? inputPath;
const study = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const Kuroshiro = KuroshiroModule.default;
const kuroshiro = new Kuroshiro();
await kuroshiro.init(new KuromojiAnalyzer());

let converted = 0;
for (const record of study.records) {
  for (const example of record.examples ?? []) {
    example.furigana = await kuroshiro.convert(example.ja, {
      mode: 'furigana',
      to: 'hiragana',
      delimiter_start: '<ruby>',
      delimiter_end: '</ruby>',
      ruby_start: '<rt>',
      ruby_end: '</rt>'
    });
    converted += 1;
  }
}

study.furigana = {
  format: 'HTML ruby markup in examples[].furigana',
  generatedWith: 'Kuroshiro + Kuromoji'
};
fs.writeFileSync(outputPath, `${JSON.stringify(study, null, 2)}\n`);
console.log(JSON.stringify({ inputPath, outputPath, examplesAnnotated: converted }));
