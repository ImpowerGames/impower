import { SparkParseResult } from "../../../sparkdown";
import { editorState } from "../state/editorState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";

export function getActiveParsedDocument(): SparkParseResult | undefined {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return undefined;
  }
  const editor = getEditor(uri);
  if (editor) {
    return editorState.parsedDocuments[editor.document.uri.toString()];
  } else {
    return editorState.parsedDocuments[editorState.lastParsedUri];
  }
}
