import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const OVERRIDE = "rgb(1,2,3)";
const URI = "file:///override.sd";

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
    "  column {",
    '    text "hello"',
    "  }",
    "end",
  ].join("\n");
}

async function render(src: string) {
  const h = createDOMHarness(src, 0, { autoOpenAll: true });
  await flushMicrotasks();
  return h;
}

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
  test("a project define replaces the builtin's value", async () => {
    const h = await render(
      source(`define ui as config with\n  root_text_size = "112.5%"\nend\n`),
    );
    await flushMicrotasks();
    expect(h.overlay.ownerDocument.documentElement.style.fontSize).toBe(
      "112.5%",
    );
  });

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

  test("two colliding AUTHORED defines still error", () => {
    const messages = diagnose(
      source(
        `define brandy as color with\n  value = "rgb(4,5,6)"\nend\n` +
          `define brandy as color with\n  value = "rgb(7,8,9)"\nend\n`,
      ),
    );
    expect(messages.some((m) => /Duplicate identifier/i.test(m))).toBe(true);
  });

  test("overriding a builtin reports no duplicate-identifier error", () => {
    const messages = diagnose(
      source(`define slate_80 as color with\n  value = "${OVERRIDE}"\nend\n`),
    );
    expect(messages.filter((m) => /Duplicate identifier/i.test(m))).toEqual([]);
  });

  test("a brand-new colour name is emitted as a theme variable", async () => {
    const h = await render(
      source(`define brandy as color with\n  value = "rgb(4,5,6)"\nend\n`),
    );
    expect(themeColor(h, "brandy")).toBe("rgb(4,5,6)");
  });
});
