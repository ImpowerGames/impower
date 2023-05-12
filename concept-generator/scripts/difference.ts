import cliProgress from "cli-progress";
import fs from "fs";
import { getConceptualDifference } from "./utils/getConceptualDifference";

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

const result = getConceptualDifference(
  process.argv[2] || "",
  process.argv[3] || "",
  termVectors,
  process.argv[4] ? Number.parseInt(process.argv[4] || "30") : undefined,
  onProgress
);
console.log(result);
