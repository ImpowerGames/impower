import { SparkProgram } from "../../../sparkdown/src";

export const generateSparkJsonData = (program: SparkProgram): string => {
  return JSON.stringify(program, null, 2);
};
