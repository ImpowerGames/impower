import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { CodeLens } from "vscode-languageserver";

export const getCodeLenses = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
): CodeLens[] | null | undefined => {
  if (!document || !annotations) {
    return undefined;
  }

  const result: CodeLens[] = [];

  if (document && annotations) {
    const cur = annotations.lenses.iter();
    while (cur.value) {
      const range = document.range(cur.from, cur.to);
      result.push({
        range,
        command: cur.value.type.command,
        data: cur.value.type.data,
      });
      cur.next();
    }
  }

  return result;
};
