import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type Tree } from "@lezer/common";
import { Position, Range } from "vscode-languageserver-textdocument";

export interface DeclarationHeading {
  type: "scene" | "branch" | "function" | "label";
  name: string;
  nameRange: Range;
  /**
   * Where the declaration's extent ends: at a scene's or branch's `end`, at a
   * function's own closing `end`, or at the name itself for a label.
   */
  end: Position;
  children: DeclarationHeading[];
}

/**
 * The scenes, branches, functions and labels a script declares, nested by
 * what encloses them, for the outline and heading folds.
 *
 * Scenes and branches come from the declarations channel. A root-level `end`
 * closes the innermost open one; a new scene closes every open one and a new
 * branch closes an open branch, since neither nests inside its own kind. One
 * closed that way ends on the line before the declaration that closed it, and
 * one still open at the end of the script runs to its last line.
 *
 * A function's extent is its `LuauFunctionDefinition` node in the tree, which
 * spans the function up to its own `end` however its body is indented. An
 * `external` declaration has no body and ends at its name. A function goes
 * inside the innermost enclosing function, or else the innermost open scene or
 * branch; a function body holds no labels, branches or scenes.
 */
export const getDeclarationHeadings = (
  document: SparkdownDocument,
  annotations: SparkdownAnnotations,
  tree: Tree | undefined,
): DeclarationHeading[] => {
  const top: DeclarationHeading[] = [];
  // Scenes and branches not yet closed, outermost first.
  const open: DeclarationHeading[] = [];
  // Functions whose definition has not ended yet, outermost first.
  const functions: { heading: DeclarationHeading; to: number }[] = [];
  const lineEnd = (line: number): Position => ({
    line,
    character: document
      .getText({
        start: { line, character: 0 },
        end: { line: line + 1, character: 0 },
      })
      .replace(/\r?\n$/, "").length,
  });
  const closeBefore = (heading: DeclarationHeading, line: number) => {
    heading.end = lineEnd(Math.max(line - 1, 0));
  };
  const place = (heading: DeclarationHeading, parent = open.at(-1)) => {
    (parent ? parent.children : top).push(heading);
  };
  const functionDefinition = (from: number) => {
    let node = tree?.resolveInner(from, 1) ?? null;
    while (node && node.name !== "LuauFunctionDefinition") {
      node = node.parent;
    }
    return node;
  };
  const cur = annotations.declarations?.iter();
  while (cur?.value) {
    const type = cur.value.type;
    while (functions.length && functions.at(-1)!.to <= cur.from) {
      functions.pop();
    }
    const nameRange = document.range(cur.from, cur.to);
    const line = nameRange.start.line;
    const heading = (type: DeclarationHeading["type"]): DeclarationHeading => ({
      type,
      name: document.getText(nameRange),
      nameRange,
      end: nameRange.end,
      children: [],
    });
    if (type === "function") {
      const h = heading("function");
      const definition = functionDefinition(cur.from);
      if (definition) {
        h.end = document.positionAt(definition.to);
      }
      place(h, functions.at(-1)?.heading ?? open.at(-1));
      functions.push({ heading: h, to: definition?.to ?? cur.to });
    }
    if (type === "scene") {
      for (const o of open.splice(0)) {
        closeBefore(o, line);
      }
      const h = heading("scene");
      place(h);
      open.push(h);
    }
    if (type === "branch") {
      if (open.at(-1)?.type === "branch") {
        closeBefore(open.pop()!, line);
      }
      const h = heading("branch");
      place(h);
      open.push(h);
    }
    if (type === "label") {
      place(heading("label"));
    }
    if (type === "end") {
      const closed = open.pop();
      if (closed) {
        closed.end = nameRange.end;
      }
    }
    cur.next();
  }
  for (const o of open) {
    o.end = lineEnd(document.lineCount - 1);
  }
  return top;
};
