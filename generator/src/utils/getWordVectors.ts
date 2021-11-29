import cliProgress from "cli-progress";
import fs from "fs";
import readline from "readline";

export const getWordVectors = async (include?: (word: string) => boolean) => {
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  const path = "./src/data/wiki.en.vec";
  const fileStream = fs.createReadStream(path);

  const wordVecs: { [word: string]: number[] } = {};

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  bar.start(2000000);

  let i = 0;

  for await (const line of rl) {
    bar.update(i);
    const parts = line.split(" ");
    const word = parts[0];
    const vector = parts.slice(1).map((n) => parseFloat(n));
    if (!include || include(word)) {
      wordVecs[word] = vector;
    }
    i += 1;
  }

  console.log(`exported ${i} vectors`);

  return wordVecs;
};
