// KNOWN GAP — a project cannot re-theme the builtin components.
//
// The palette is authored as `define <name> as color`, and the engine turns
// each into a `--theme-color-<name>` CSS variable, so redefining `slate_80` in
// a project file ought to re-theme every builtin that is built from it. It does
// nothing, and it is the reason the Pico showcase cannot match Pico's palette
// without hard-coding hexes into the showcase itself.
//
// Root cause, traced:
//   1. `scopeDefineInstances` rewrites both defines to the same key
//      (`$color_slate_80`).
//   2. `FlowBase.AddNewVariableDeclaration` is FIRST-WRITER-WINS, and the
//      builtins prelude is source-injected first, so the builtin is the
//      incumbent and the authored declaration is dropped.
//   3. `Story.ExportRuntime` only emits a `__def` init for declarations still in
//      `variableDeclarations`, so the authored value never reaches the runtime
//      type table.
//   4. The engine reads the LIVE runtime tables (`buildDefinesContext`), not
//      `program.context` — and `program.context.color.slate_80` DOES already
//      hold the authored value, which is why this looks like it should work.
//
// The compiler comment at the injection site says the prelude is injected first
// "so an authored define reusing a builtin name re-registers/overrides in
// place" — going first is precisely what makes the builtin win, so the override
// was intended and never worked.
//
// Fixing it means letting a same-type redefinition REPLACE the incumbent when
// the incumbent came from the prelude, while two colliding defines in authored
// files keep erroring. There is currently no marker for "came from the
// prelude": both declarations have a null `debugMetadata`, so the distinction
// has to be minted during parsing. That is a language-semantics decision, so
// these stay skipped rather than being quietly made to pass.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const OVERRIDE = "rgb(1,2,3)";

function source(defines: string): string {
  return [
    defines,
    "layout main with",
    "  column:",
    '    text "hello"',
    "end",
  ].join("\n");
}

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await flushMicrotasks();
  return h;
}

/** The value the engine actually emitted for `--theme-color-<name>`. */
function themeColor(h: { overlay: HTMLElement }, name: string): string | null {
  const doc = h.overlay.ownerDocument;
  for (const style of doc.querySelectorAll("style")) {
    const css = style.textContent ?? "";
    const m = new RegExp(`--theme-color-${name}:\\s*([^;}]+)`).exec(css);
    if (m) return m[1]!.trim();
  }
  return null;
}

describe("overriding a builtin colour token", () => {
  test.skip("a project define replaces the builtin's value", async () => {
    const h = await render(
      source(`define slate_80 as color with\n  value = "${OVERRIDE}"\nend\n`),
    );
    expect(themeColor(h, "slate_80")).toBe(OVERRIDE);
  });

  // This half DOES work today, and is the only supported way to add colour.
  test("a brand-new colour name is emitted as a theme variable", async () => {
    const h = await render(
      source(`define brandy as color with\n  value = "rgb(4,5,6)"\nend\n`),
    );
    expect(themeColor(h, "brandy")).toBe("rgb(4,5,6)");
  });
});
