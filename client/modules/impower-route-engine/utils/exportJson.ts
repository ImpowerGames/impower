import { getScriptAugmentations, SparkParser } from "../../../../spark-engine";
import { downloadFile } from "./downloadFile";

export const exportJson = (
  name: string,
  script: string,
  files?: Record<
    string,
    {
      name?: string;
      fileType?: string;
      fileUrl?: string;
    }
  >
): void => {
  const augmentations = getScriptAugmentations(files);
  const result = SparkParser.instance.parse(script, { augmentations });
  downloadFile(`${name}.json`, "text/plain", JSON.stringify(result));
};
