import { SparkSection } from "..";

export const createSparkSection = (): SparkSection => {
  return {
    type: "section",
    name: "",
    from: -1,
    to: -1,
    line: -1,
    level: -1,
    index: -1,
  };
};
