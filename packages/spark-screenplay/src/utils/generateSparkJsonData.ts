import { SparkParseResult } from "../../../sparkdown";

export const generateSparkJsonData = (result: SparkParseResult): string => {
  return JSON.stringify(result, null, 2);
};
