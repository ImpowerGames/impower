import { SparkProgram } from "@impower/sparkdown/src/index";
import { parseState } from "../state/parseState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getVisibleEditor } from "./getVisibleEditor";

export function getActiveParsedProgram(): SparkProgram | undefined {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return undefined;
  }
  const editor = getVisibleEditor(uri);
  if (editor) {
    return parseState.parsedPrograms[editor.document.uri.toString()];
  } else {
    return parseState.parsedPrograms[parseState.lastParsedUri];
  }
}
