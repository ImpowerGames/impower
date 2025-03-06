import { DocumentLink } from "vscode-languageserver";
import { type Tree } from "@lezer/common";
import { type TextDocument } from "vscode-languageserver-textdocument";
import SparkdownTextDocuments from "../../classes/SparkdownTextDocuments";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

export const getDocumentLinks = (
  document: TextDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations | undefined,
  documents: SparkdownTextDocuments
): DocumentLink[] | null | undefined => {
  if (!document || !tree) {
    return undefined;
  }

  const result: DocumentLink[] = [];

  if (document && annotations) {
    const cur = annotations.links.iter();
    while (cur.value) {
      const range = {
        start: document.positionAt(cur.from),
        end: document.positionAt(cur.to),
      };
      const text = document.getText(range);
      result.push({
        range,
        target: documents.resolve(document.uri, text),
      });
      cur.next();
    }
  }

  return result;
};
