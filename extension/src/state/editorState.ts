import { SparkParseResult } from "../../../sparkdown";

export const editorState = {
  lastParsedUri: "",
  lastShiftedParseId: "",
  parsedDocuments: {} as Record<string, SparkParseResult>,
};
