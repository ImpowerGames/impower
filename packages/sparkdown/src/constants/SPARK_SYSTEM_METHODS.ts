import { SparkSection } from "../types/SparkSection";

export const SPARK_SYSTEM_METHODS = {
  ".load": {
    from: -1,
    to: -1,
    line: -1,
    level: -1,
    index: -1,
    indent: 0,
    type: "method",
    name: "load",
    returnType: "",
    variables: {
      ".load.filename": {
        from: -1,
        to: -1,
        line: -1,
        parameter: true,
        name: "filename",
        type: "object",
        value: "",
      },
    },
  } as SparkSection,
};
