import { SparkLine } from "../types/SparkLine";

const createSparkLine = (obj?: Partial<SparkLine>): SparkLine => {
  return {
    type: "comment",
    line: -1,
    from: -1,
    to: -1,
    content: "",
    text: "",
    offset: 0,
    indent: 0,
    order: 0,
    ignore: false,
    skipToNextPreview: false,
    notes: undefined,
    ...obj,
  };
};

export default createSparkLine;
