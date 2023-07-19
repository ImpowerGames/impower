import { SparkProgram } from "@impower/sparkdown/src/index";
import { SparkProgramManager } from "../providers/SparkProgramManager";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";

export function getActiveParsedProgram(): SparkProgram | undefined {
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return undefined;
  }
  const editor = getEditor(uri);
  if (editor) {
    return SparkProgramManager.instance.get(editor.document.uri);
  } else {
    return SparkProgramManager.instance.getLastParsed();
  }
}
