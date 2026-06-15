import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { Tree } from "@lezer/common";
import { type TextEdit } from "vscode-languageserver";

// Walks the parse tree looking for `LuauExplicitStatement` nodes
// nested inside a `LuauFunctionDefinition` and emits delete edits
// that strip the redundant `& ` prefix. The `&` prefix is only
// meaningful at top-level scope where it disambiguates Luau
// statements from display text — inside function bodies, the
// statement-level forms (bare calls, reassignments, declarations)
// compile identically without the prefix.
//
// Edits target only the `_begin` capture of the explicit statement,
// which spans the leading whitespace + `&` mark + trailing required
// whitespace. Deleting that captured range leaves the actual
// statement body unchanged.
export function collectRedundantDiscardEdits(
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
): TextEdit[] {
  if (!document || !tree) return [];
  const edits: TextEdit[] = [];
  // Stack of LuauFunctionDefinition bounds we're currently inside.
  // A node counts as "inside a function body" iff its range is
  // strictly within any active definition's range.
  const fnStack: { from: number; to: number }[] = [];

  const cursor = tree.cursor();
  walk();
  return edits;

  function walk(): void {
    const name = cursor.name;
    const from = cursor.from;
    const to = cursor.to;
    let pushed = false;
    if (name === "LuauFunctionDefinition") {
      fnStack.push({ from, to });
      pushed = true;
    } else if (name === "LuauExplicitStatement" && isInsideAnyFunction()) {
      // Delete from the `&` mark through the trailing required
      // whitespace, but PRESERVE the leading indentation that
      // precedes the `&`. The whitespace formatter is responsible
      // for indentation; if we ate the indent here, the next pass
      // would re-insert it and we'd lose idempotency.
      //
      // The `LuauExplicitStatement_begin` capture spans:
      //   _c1 — optional leading whitespace (KEEP — that's the
      //         indent the formatter set)
      //   _c2 — the `&` mark
      //   _c3 — required trailing whitespace
      // Delete from _c2.from to _c3.to.
      if (cursor.firstChild()) {
        try {
          do {
            if (cursor.name === "LuauExplicitStatement_begin") {
              const deleteRange = findMarkAndTrailingRange(cursor);
              if (deleteRange) {
                edits.push({
                  range: {
                    start: document!.positionAt(deleteRange.from),
                    end: document!.positionAt(deleteRange.to),
                  },
                  newText: "",
                });
              }
              break;
            }
          } while (cursor.nextSibling());
        } finally {
          cursor.parent();
        }
      }
    }
    // Descend into children, walking each subtree in pre-order.
    if (cursor.firstChild()) {
      walk();
      while (cursor.nextSibling()) {
        walk();
      }
      cursor.parent();
    }
    if (pushed) fnStack.pop();
  }

  function isInsideAnyFunction(): boolean {
    return fnStack.length > 0;
  }
}

// Cursor is at `LuauExplicitStatement_begin`. Returns the deletion
// range: from the `&` mark capture start to the trailing-whitespace
// capture end. Leaves the leading-whitespace capture (_c1) alone so
// the original indentation survives. Falls back to the whole begin's
// range if the capture structure isn't what we expect.
function findMarkAndTrailingRange(
  cursor: ReturnType<Tree["cursor"]>,
): { from: number; to: number } | null {
  // Snapshot the begin's bounds as the fallback delete range.
  const beginFrom = cursor.from;
  const beginTo = cursor.to;
  if (!cursor.firstChild()) return { from: beginFrom, to: beginTo };
  try {
    // Find _c2 (the `&` mark capture). Its `from` becomes our delete
    // start. The `to` end is the last sibling's end (_c3 if present,
    // otherwise _c2's own end).
    let markFrom: number | null = null;
    let endTo: number | null = null;
    do {
      const childName = cursor.name;
      if (childName.endsWith("_c2") && markFrom === null) {
        markFrom = cursor.from;
      }
      if (markFrom !== null) {
        endTo = cursor.to;
      }
    } while (cursor.nextSibling());
    if (markFrom !== null && endTo !== null) {
      return { from: markFrom, to: endTo };
    }
  } finally {
    cursor.parent();
  }
  return { from: beginFrom, to: beginTo };
}
