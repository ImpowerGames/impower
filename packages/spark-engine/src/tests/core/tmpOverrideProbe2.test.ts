// TEMP probe #2 — what override paths actually work. Delete after reading.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";

const URI = "file:///main.sd";

function compile(src: string, seed: boolean) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: seed,
    definitions: { builtins: {} as any },
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 0,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: URI } });
}

function diags(program: any) {
  const out: string[] = [];
  for (const v of Object.values(program.diagnostics ?? {})) {
    for (const d of v as any[]) {
      out.push(
        `[sev=${d.severity}] ` +
          (typeof d.message === "string" ? d.message : d.message?.value),
      );
    }
  }
  return out;
}

const COLOR_SRC = `define slate_80 as color with
  value = "rgb(1,2,3)"
end

Hello.
`;

const STYLE_SRC = `style button with
  background_color = "rgb(1,2,3)"
end

Hello.
`;

const CUSTOMPROP_SRC = `style main with
  --theme-color-slate_80 = "rgb(1,2,3)"
end

Hello.
`;

const RECOMMENDED_SRC = `define brand as color with
  value = "rgb(1,2,3)"
end

style button with
  background-color = brand
end

Hello.
`;

describe("override probe 2", () => {
  test("D: new color + style override (the recommended path)", () => {
    const r = compile(RECOMMENDED_SRC, true);
    // eslint-disable-next-line no-console
    console.log("D diagnostics:", JSON.stringify(diags(r.program), null, 1));
    const btn = (r.program as any)?.styles?.button ?? {};
    // eslint-disable-next-line no-console
    console.log(
      "D styles.button background-color =",
      JSON.stringify(btn["background-color"]),
      "| border-color (untouched builtin) =",
      JSON.stringify(btn["border-color"]),
      "| hover block =",
      JSON.stringify(btn["@hovered, @pressed, @focused"]),
    );
    const story = new Story(r.program.compiled as any);
    const ctx = buildDefinesContext(story as any);
    // eslint-disable-next-line no-console
    console.log("D runtime color.brand =", JSON.stringify(ctx["color"]?.["brand"]));
    expect(true).toBe(true);
  });

  test("A: color redefine, UNSEEDED (editor LSP compiler)", () => {
    const r = compile(COLOR_SRC, false);
    // eslint-disable-next-line no-console
    console.log("A diagnostics:", JSON.stringify(diags(r.program), null, 1));
    // eslint-disable-next-line no-console
    console.log(
      "A program.context.color.slate_80 =",
      JSON.stringify((r.program.context as any)?.color?.slate_80),
    );
    expect(true).toBe(true);
  });

  test("B: style block reusing a BUILTIN style name (seeded)", () => {
    const r = compile(STYLE_SRC, true);
    // eslint-disable-next-line no-console
    console.log("B diagnostics:", JSON.stringify(diags(r.program), null, 1));
    // eslint-disable-next-line no-console
    console.log(
      "B program.context.style.button =",
      JSON.stringify((r.program.context as any)?.style?.button),
    );
    // eslint-disable-next-line no-console
    console.log(
      "B program.styles.button =",
      JSON.stringify((r.program as any)?.styles?.button),
    );
    const story = new Story(r.program.compiled as any);
    const ctx = buildDefinesContext(story as any);
    // eslint-disable-next-line no-console
    console.log("B runtime style keys:", JSON.stringify(Object.keys(ctx["style"] ?? {})));
    expect(true).toBe(true);
  });

  test("C: custom property inside a style block", () => {
    const r = compile(CUSTOMPROP_SRC, true);
    // eslint-disable-next-line no-console
    console.log("C diagnostics:", JSON.stringify(diags(r.program), null, 1));
    // eslint-disable-next-line no-console
    console.log(
      "C program.styles.main =",
      JSON.stringify((r.program as any)?.styles?.main),
    );
    expect(true).toBe(true);
  });
});
