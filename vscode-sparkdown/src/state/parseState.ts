import { SparkProgram } from "@impower/sparkdown/src/index";

export const parseState = {
  lastParsedUri: "",
  lastShiftedParseId: "",
  parsedDocuments: {} as Record<string, SparkProgram>,
};
