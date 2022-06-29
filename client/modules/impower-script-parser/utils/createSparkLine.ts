import { SparkLine } from "../types/SparkLine";

export const createSparkLine = (obj?: Partial<SparkLine>): SparkLine => {
  const t: SparkLine = {
    type: "comment",
    content: "",
    text: "",
    notes: [],
    line: -1,
    from: -1,
    to: -1,
    offset: -1,
    indent: -1,
    order: -1,
    ignore: false,
    skipToNextPreview: false,
    html: "",
    ...obj,
  };
  return t;
};
