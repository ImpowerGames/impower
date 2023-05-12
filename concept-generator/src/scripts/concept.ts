import cliProgress from "cli-progress";
import fs from "fs";
import { getConceptualExamples } from "../utils/getConceptualExamples";

const termVectorsPath = "./tmp/termVectors.json";

const termVectors = JSON.parse(fs.readFileSync(termVectorsPath, "utf8"));

const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
const onProgress = (current: number, total: number) => {
  if (current < 0) {
    bar.start(total, 0);
  }
  if (current === total) {
    bar.stop();
  }
};

const result = getConceptualExamples(
  termVectors,
  process.argv.slice(2),
  onProgress
);
console.log(result);
