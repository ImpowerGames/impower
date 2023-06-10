import { SparkParseResult } from "../../../sparkdown/src";

export const generateSparkJsonData = (result: SparkParseResult): string => {
  return JSON.stringify(result, null, 2);
};
