import { SparkProgram } from "@impower/sparkdown/src/index";
import { parseState } from "../state/parseState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";

export function getActiveParsedDocument(): SparkProgram | undefined {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return undefined;
  }
  const editor = getEditor(uri);
  if (editor) {
    return parseState.parsedDocuments[editor.document.uri.toString()];
  } else {
    return parseState.parsedDocuments[parseState.lastParsedUri];
  }
}
