import { SparkTokenTagMap } from "../types/SparkToken";

const createSparkToken = <K extends keyof SparkTokenTagMap = "comment">(
  tag?: K,
  obj?: Partial<SparkTokenTagMap[K]>
): SparkTokenTagMap[K] => {
  const t = { tag } as SparkTokenTagMap[K];
  t.line = obj?.line ?? -1;
  t.from = obj?.from ?? -1;
  t.to = obj?.to ?? -1;
  t.indent = obj?.indent ?? 0;
  if (obj?.ignore != null) {
    t.ignore = obj?.ignore;
  }
  if (obj?.print != null) {
    t.print = obj?.print;
  }
  if (obj?.html != null) {
    t.html = obj?.html;
  }
  return t;
};

export default createSparkToken;
