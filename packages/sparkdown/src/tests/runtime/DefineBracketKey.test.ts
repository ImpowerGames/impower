import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      } as any,
    ],
  });
  return compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
};

describe("selector and bracket-key properties", () => {
  test("a style's selector and $-prefixed blocks reach context alongside identifier keys", () => {
    const result = compile(`style text {
  display = block
  >> * { display = inline }
  $link { audio {} }
}
`);
    const s = result.program.context?.["style"]?.["text"];
    expect(s).toBeDefined();
    expect(s!["$type"]).toBe("style");
    expect(s!["$name"]).toBe("text");
    expect(s!["display"]).toBe("block");
    expect(s![">> *"]).toEqual({ display: "inline" });
    expect(s!["$link"]).toEqual({ audio: {} });
  });

  test("a bracket-key line does NOT desync the rest of the body", () => {
    const result = compile(`define img as image with
  ["$x"] = {}
  src = "after.png"
end
`);
    const img = result.program.context?.["image"]?.["img"];
    expect(img).toBeDefined();
    expect(img!["src"]).toBe("after.png");
  });

  test("compiles without diagnostics", () => {
    const result = compile(`style text {
  >> * { display = inline }
}

scene start
end
`);
    const diags = result.program.diagnostics?.["inmemory:///main.sd"] ?? [];
    const errors = diags.filter((d: any) => d?.severity === 1);
    expect(errors).toEqual([]);
  });
});
