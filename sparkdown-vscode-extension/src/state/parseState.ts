import { SparkParseResult } from "../../../sparkdown";

export const parseState = {
  lastParsedUri: "",
  lastShiftedParseId: "",
  parsedDocuments: {} as Record<string, SparkParseResult>,
};
