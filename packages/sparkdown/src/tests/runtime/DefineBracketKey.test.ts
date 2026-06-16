// Define bodies are Luau-table-faithful: a property key may be a bracket-key
// (`["selector"] = …`, `["$link"] = …`) in addition to a plain identifier.
// This lets defines express CSS-style selector keys and `$`-prefixed metadata
// keys that aren't valid identifiers (and that would otherwise desync the
// `with … end` body parse). The key reaches BOTH `program.context` (for the
// LSP) and the runtime `__def` table.

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

describe("define bracket-key properties", () => {
  test("selector + $-prefixed bracket-keys reach context alongside identifier keys", () => {
    const result = compile(`define text as style with
  display = "block"
  [">> *"] = { display = "inline" }
  ["$link"] = { audio = {} }
end
`);
    const s = result.program.context?.["style"]?.["text"];
    expect(s).toBeDefined();
    expect(s!["$type"]).toBe("style");
    expect(s!["$name"]).toBe("text");
    expect(s!["display"]).toBe("block"); // identifier key still works
    expect(s![">> *"]).toEqual({ display: "inline" }); // selector key
    expect(s!["$link"]).toEqual({ audio: {} }); // $-prefixed key
  });

  test("a bracket-key line does NOT desync the rest of the body", () => {
    // Regression: before bracket-key support, the `[...]` line broke the parse
    // and silently dropped every property after it.
    const result = compile(`define img as image with
  ["$x"] = {}
  src = "after.png"
end
`);
    const img = result.program.context?.["image"]?.["img"];
    expect(img).toBeDefined();
    expect(img!["src"]).toBe("after.png"); // survived the bracket line
  });

  test("compiles without diagnostics", () => {
    const result = compile(`define text as style with
  [">> *"] = { display = "inline" }
end
`);
    const diags = result.program.diagnostics?.["inmemory:///main.sd"] ?? [];
    const errors = diags.filter((d: any) => d?.severity === 1);
    expect(errors).toEqual([]);
  });
});
