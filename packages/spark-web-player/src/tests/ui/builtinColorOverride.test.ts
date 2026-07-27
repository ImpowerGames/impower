// A project can override a builtin define — a colour token, a `config` value —
// by redefining it under the same name.
//
// This did not work until 2026-07-26, and the way it failed is worth keeping:
//   1. `scopeDefineInstances` rewrites both defines to the same global key
//      (`$color_slate_80`).
//   2. `FlowBase.AddNewVariableDeclaration` is FIRST-writer-wins and the
//      builtins prelude is source-injected FIRST, so the builtin was the
//      incumbent and the authored define lost — with a "Duplicate identifier"
//      error that failed the whole project's compile.
//   3. The compiler comment at the injection site claimed the prelude goes
//      first "so an authored define reusing a builtin name overrides in place".
//      Going first is precisely what made the builtin win: it was backwards,
//      and the override never worked.
//   4. `program.context` DID hold the authored value the whole time, because it
//      is merged separately (`inheritDefaults`). The engine reads the LIVE
//      runtime tables (`buildDefinesContext`) instead, so anything inspecting
//      compile-time context saw an override that did not exist at runtime.
//
// The fix is `SparkdownCompiler.applyBuiltinOverrides`: tag the prelude's
// declarations (nothing else distinguishes them — both sides carry a null
// `debugMetadata`), let an authored define take the slot from a tagged
// incumbent, and BACK-FILL the authored `__def` table with the builtin values
// the author didn't restate. Two colliding AUTHORED defines still error.
//
// The back-fill is the load-bearing half: without it a partial override drops
// every field it doesn't mention, and `config.ui` losing `layouts_element_name`
// means `reveal()` can't find the screen root — a black preview, no error.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const OVERRIDE = "rgb(1,2,3)";
const URI = "file:///override.sd";

/** Compile `src` and flatten every diagnostic message (all severities). */
function diagnose(src: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const messages: string[] = [];
  for (const docDiags of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiags as any[]) {
      messages.push(
        typeof d?.message === "string"
          ? d.message
          : (d?.message?.value ?? JSON.stringify(d)),
      );
    }
  }
  return messages;
}

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

describe("overriding a builtin config value", () => {
  // Same defect, second victim: `config.ui.root_text_size` exists precisely so a
  // project can rescale every `rem` without the engine forcing a root font size
  // on games that never asked for one. The renderer half works (proved by
  // temporarily changing the builtin default: the value reaches UIManager and
  // lands on the document root) — but `define ui as config` collides with the
  // prelude's own `ui`, so the authored value never reaches the runtime table
  // and the property is unsettable by the only audience it exists for.
  test("a project define replaces the builtin's value", async () => {
    const h = await render(
      source(`define ui as config with\n  root_text_size = "112.5%"\nend\n`),
    );
    await flushMicrotasks();
    expect(h.overlay.ownerDocument.documentElement.style.fontSize).toBe(
      "112.5%",
    );
  });

  // The whole risk of letting an override win the slot: a partial override must
  // not silently drop the builtin's other fields. `layouts_element_name` is the
  // one that bites hardest — `reveal()` bails on an undefined value, so screens
  // stay at opacity:0 and the preview goes black with no error.
  test("a partial override keeps the builtin's other fields", async () => {
    const h = await render(
      source(`define ui as config with\n  root_text_size = "112.5%"\nend\n`),
    );
    const ui = (h.game as any)?.context?.config?.ui;
    expect(ui?.root_text_size).toBe("112.5%");
    expect(ui?.layouts_element_name).toBe("layouts");
    expect(ui?.styles_element_name).toBe("styles");
    expect(ui?.breakpoints?.md).toBe(768);
  });

  // The two views used to disagree — compile-time context held the override
  // while the runtime table kept the builtin. Anything reading `program.context`
  // therefore saw an override that did not exist where it mattered, so pin that
  // they now agree.
  test("compile-time context and the runtime table agree", async () => {
    const h = await render(
      source(`define ui as config with\n  root_text_size = "112.5%"\nend\n`),
    );
    const game = h.game as any;
    expect(game?.program?.context?.config?.ui?.root_text_size).toBe("112.5%");
    expect(game?.context?.config?.ui?.root_text_size).toBe("112.5%");
  });
});

describe("overriding a builtin colour token", () => {
  test("a project define replaces the builtin's value", async () => {
    const h = await render(
      source(`define slate_80 as color with\n  value = "${OVERRIDE}"\nend\n`),
    );
    expect(themeColor(h, "slate_80")).toBe(OVERRIDE);
  });

  // The override path must not become a general amnesty: only the PRELUDE's
  // declarations are overridable. Two defines colliding in authored files is
  // still a genuine mistake and must still be reported.
  test("two colliding AUTHORED defines still error", () => {
    const messages = diagnose(
      source(
        `define brandy as color with\n  value = "rgb(4,5,6)"\nend\n` +
          `define brandy as color with\n  value = "rgb(7,8,9)"\nend\n`,
      ),
    );
    expect(messages.some((m) => /Duplicate identifier/i.test(m))).toBe(true);
  });

  // ...and overriding a builtin must NOT report one.
  test("overriding a builtin reports no duplicate-identifier error", () => {
    const messages = diagnose(
      source(`define slate_80 as color with\n  value = "${OVERRIDE}"\nend\n`),
    );
    expect(messages.filter((m) => /Duplicate identifier/i.test(m))).toEqual([]);
  });

  // This half always worked, and is how a project adds a NEW colour.
  test("a brand-new colour name is emitted as a theme variable", async () => {
    const h = await render(
      source(`define brandy as color with\n  value = "rgb(4,5,6)"\nend\n`),
    );
    expect(themeColor(h, "brandy")).toBe("rgb(4,5,6)");
  });
});
