import { SparkProgram } from "@impower/sparkdown/src/index";

export const parseState = {
  lastParsedUri: "",
  lastShiftedParseId: "",
  parsedPrograms: {} as Record<string, SparkProgram>,
};
