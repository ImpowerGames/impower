import { describe, expect, test } from "vitest";
import { MAIN_URI, programCompiler } from "../program/programHarness";

const SCENE = "\nscene start\n  Hi.\nend\n";

function compile(source: string) {
  const { program } = programCompiler({ [MAIN_URI]: source + SCENE }).compile();
  const messages: string[] = [];
  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
    for (const d of docDiagnostics as any[]) {
      const message = typeof d.message === "string" ? d.message : d.message?.value;
      messages.push(`${d.range?.start?.line}:${d.range?.start?.character} ${message}`);
    }
  }
  return { style: (program.context as any)?.style?.character_name, messages };
}

const propWarnings = (messages: string[]) => messages.filter((m) => m.includes("Unrecognized prop"));

describe("a `#name=value { ... }` block in a style body is a nested selector (#2795)", () => {
  test("an unquoted value keys the block by its selector", () => {
    const { style, messages } = compile(
      "style character_name {\n  #variant=left {\n    align-self = start\n    @variant(left) { opacity = 1 }\n  }\n}\n",
    );
    expect(style?.["#variant=left"]).toEqual({ "align-self": "start", "@variant(left)": { opacity: "1" } });
    expect(style?.[""]).toBeUndefined();
    expect(propWarnings(messages)).toEqual([]);
  });

  test("a quoted value keys the block by its selector", () => {
    const { style, messages } = compile('style character_name {\n  #variant="left" {\n    align-self = start\n  }\n}\n');
    expect(style?.['#variant="left"']).toEqual({ "align-self": "start" });
    expect(style?.[""]).toBeUndefined();
    expect(propWarnings(messages)).toEqual([]);
  });

  test("a selector after an element name keeps both", () => {
    const { style, messages } = compile("style character_name {\n  > text#speaker=bunny {\n    opacity = 0.5\n  }\n}\n");
    expect(style?.["> text#speaker=bunny"]).toEqual({ opacity: "0.5" });
    expect(propWarnings(messages)).toEqual([]);
  });
});
