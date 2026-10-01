import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseSource } from "./grammarSnapshot";

// #1229: `builtins.sd` is written in the brace forms of #1222. Read through
// the grammar, none of its struct bodies (`layout`, `component`, `style`,
// `animation`, `theme`, `morph`, `screen`) holds a `:` header, a `-` list
// item or a bare-word class.

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUILTINS = readFileSync(
  join(__dirname, "../../compiler/builtins/builtins.sd"),
  "utf8",
);

// The nodes the grammar gives the indented forms: a `key:` header and its
// colon (a component call's `:` too), a `-` item, and an element line with a
// bare-word class (`mask shadow_1`); inside a brace block, a bare word after
// an element's name (`LuauSparkleElementWord`, a class until the last slice
// of #1222).
const OLD_FORM_NODES = new Set([
  "LuauStructObjectHeader",
  "LuauStructObjectColon",
  "LuauStructArrayItem",
  "ArrayItemOperator",
  "LuauStructBareMarker",
  "LuauSparkleElementWord",
]);

const STRUCT_BODY = /^(layout|component|style|animation|theme|morph|screen)\b/;

/** Each old-form node in a struct body, as `line: text`. */
function oldForms(source: string): string[] {
  const tree = parseSource(source);
  const lineOf = (pos: number) => source.slice(0, pos).split("\n").length;
  const found: string[] = [];
  const cursor = tree.cursor();
  do {
    if (!OLD_FORM_NODES.has(cursor.name)) continue;
    // A one-word element line (`loading_backdrop`) is a plain container with
    // no class, written the same way in both forms.
    if (
      cursor.name === "LuauStructBareMarker" &&
      !/\s/.test(source.slice(cursor.from, cursor.to).trim())
    ) {
      continue;
    }
    // The declaration the node sits in: the last line at column 0 before it
    // that opens one.
    const before = source.slice(0, cursor.from).split("\n");
    const declaration = [...before].reverse().find((l) => /^\S/.test(l)) ?? "";
    if (!STRUCT_BODY.test(declaration)) continue;
    found.push(`${lineOf(cursor.from)}: ${cursor.name} ${JSON.stringify(source.slice(cursor.from, cursor.to))}`);
  } while (cursor.next());
  return found;
}

describe("builtins.sd is written in the brace forms", () => {
  test("the struct bodies hold no `:` header, `-` item or bare-word class", () => {
    expect(oldForms(BUILTINS)).toEqual([]);
  });

  test("the check finds each old form (positive control)", () => {
    const found = oldForms(
      [
        "layout main with",
        "  stage:",
        "    mask shadow_1",
        "  row {",
        "    choice 0",
        "  }",
        "end",
        "",
        "animation show with",
        "  keyframes:",
        "    -",
        "      opacity = \"1\"",
        "end",
        "",
      ].join("\n"),
    );
    const names = found.map((f) => f.split(" ")[1]);
    expect(names).toContain("LuauStructObjectHeader");
    expect(names).toContain("LuauStructArrayItem");
    expect(names).toContain("LuauStructBareMarker");
    expect(names).toContain("LuauSparkleElementWord");
  });
});
