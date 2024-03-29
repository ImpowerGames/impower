import cliProgress from "cli-progress";
import fs from "fs";
import readline from "readline";

export const getWordVectors = async (
  modelPath: string,
  include?: (word: string) => boolean
) => {
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  const fileStream = fs.createReadStream(modelPath);

  const wordVecs: { [word: string]: number[] } = {};

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const vectorCount = 2519371;

  bar.start(vectorCount, 0);

  for await (const line of rl) {
    bar.increment();
    const parts = line.split(" ");
    const word = parts[0];
    const vector = parts
      .slice(1)
      .map((n) => parseFloat(n))
      .filter((x) => !Number.isNaN(x));
    if (word) {
      if (!include || include(word)) {
        wordVecs[word] = vector;
      }
    }
  }

  bar.stop();

  return wordVecs;
};
