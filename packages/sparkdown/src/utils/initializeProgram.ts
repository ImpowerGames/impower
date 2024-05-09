import { SparkProgram } from "../types/SparkProgram";

const initializeProgram = (program: SparkProgram) => {
  program.context ??= {};

  program.chunks ??= {};
  program.chunks[""] = {
    tag: "chunk",
    line: 0,
    from: 0,
    to: 0,
    indent: 0,
    name: "",
    id: "",
  };

  program.sections ??= {};
  program.sections[""] = {
    tag: "section",
    line: 0,
    from: 0,
    to: 0,
    indent: 0,
    level: 0,
    path: [],
    parent: undefined,
    name: "",
    id: "",
    tokens: [],
  };
  return program;
};

export default initializeProgram;
