import { RangeSet } from "@codemirror/state";
import { Reference } from "@impower/sparkdown/src/classes/annotators/ReferenceAnnotator";
import { SparkdownAnnotation } from "@impower/sparkdown/src/classes/SparkdownAnnotation";
import { TextDocument } from "vscode-languageserver-textdocument";

export const getSymbolContext = (
  document: TextDocument,
  references: RangeSet<SparkdownAnnotation<Reference>>,
  pos: number
): {
  scopePath?: string;
  reference?: Reference;
} => {
  const read = (from: number, to: number) =>
    document.getText({
      start: document.positionAt(from),
      end: document.positionAt(to),
    });
  let scopePathParts: { kind: "" | "knot" | "stitch"; name: string }[] = [];
  const cur = references?.iter();
  if (cur) {
    while (cur.value) {
      if (cur.from >= pos) {
        const scopePath = scopePathParts.map((p) => p.name).join(".");
        return { scopePath, reference: cur.value.type };
      }
      if (cur.value.type.declaration === "knot") {
        scopePathParts = [];
        scopePathParts.push({ kind: "knot", name: read(cur.from, cur.to) });
      }
      if (cur.value.type.declaration === "stitch") {
        const prevKind = scopePathParts.at(-1)?.kind || "";
        if (prevKind === "stitch") {
          scopePathParts.pop();
        }
        scopePathParts.push({ kind: "stitch", name: read(cur.from, cur.to) });
      }
      cur.next();
    }
  }
  return {};
};
