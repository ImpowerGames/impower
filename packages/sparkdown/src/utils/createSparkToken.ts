import { SparkTokenTagMap } from "../types/SparkToken";

const createSparkToken = <K extends keyof SparkTokenTagMap = "comment">(
  tag?: K,
  obj?: Partial<SparkTokenTagMap[K]>
): SparkTokenTagMap[K] => {
  const t = {
    tag,
    line: -1,
    from: -1,
    to: -1,
    indent: 0,
  } as SparkTokenTagMap[K];
  return { ...t, ...(obj || {}) };
};

export default createSparkToken;
