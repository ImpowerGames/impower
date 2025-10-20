import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type Tree } from "@lezer/common";
import { DocumentLink } from "vscode-languageserver";
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

export const getDocumentLinks = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations | undefined,
  workspace: SparkdownLanguageServerWorkspace
): DocumentLink[] | null | undefined => {
  if (!document || !tree) {
    return undefined;
  }

  const result: DocumentLink[] = [];

  if (document && annotations) {
    const cur = annotations.links.iter();
    while (cur.value) {
      const range = document.range(cur.from, cur.to);
      const text = document.getText(range);
      result.push({
        range,
        target: workspace.resolve(document.uri, text),
      });
      cur.next();
    }
  }

  return result;
};
