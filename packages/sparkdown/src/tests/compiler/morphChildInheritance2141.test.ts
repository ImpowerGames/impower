import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { buildMorphMotion } from "../../morph/motion";

const URI = "file:///main.sd";

const BASE_BODY = [
  "  blend = cut",
  "  timing {",
  "    duration = 0.75",
  "    easing = linear",
  "  }",
  "  keyframes {",
  "    from {",
  "      mouth {",
  "        state = closed",
  "        translate = 0 2px",
  "      }",
  "    }",
  "    to {",
  "      mouth {",
  "        state = open",
  "      }",
  "    }",
  "  }",
];

const BASE_STRUCT = {
  blend: "cut",
  timing: { duration: 0.75, easing: "linear" },
  keyframes: [{ mouth: { state: "closed", translate: "0 2px" } }, { mouth: { state: "open" } }],
};

function compile(lines: string[], builtinBase?: Record<string, unknown>) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...(builtinBase
      ? { useBuiltinsPrelude: false, definitions: { builtins: { morph: { base: { $type: "morph", $name: "base", ...builtinBase } } } } }
      : {}),
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: [...lines, "", "scene start", "end", ""].join("\n"), version: 1, languageId: "sparkdown" }],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const written = ["morph base {", ...BASE_BODY, "}", ""];

const cases: [string, string[], Record<string, unknown> | undefined, string][] = [
  ["a parent written in the scripts", [...written, "morph child as base {", "  blend = cut", "}"], undefined, "child"],
  ["a grandchild chain", [...written, "morph child as base {", "  blend = cut", "}", "", "morph grandchild as child {", "  blend = cut", "}"], undefined, "grandchild"],
  ["a parent from definitions.builtins.morph", ["morph child as base {", "  blend = cut", "}"], BASE_STRUCT, "child"],
];

describe("a child morph resolves its parent's fields for the engine", () => {
  test.each(cases)("%s", (_label, lines, builtinBase, name) => {
    const program = compile(lines, builtinBase);
    const morph = program.context!["morph"]![name]!;
    expect(morph.timing.duration).toBe(0.75);
    expect(morph.timing.easing).toBe("linear");
    expect(JSON.stringify(buildMorphMotion(morph.keyframes))).toContain("mouth");
    expect(morph.$extends).toBeDefined();
  });

  test("a child's own timing field overrides only that field", () => {
    const program = compile([...written, "morph child as base {", "  timing {", "    duration = 0.5", "  }", "}"]);
    const morph = program.context!["morph"]!["child"]!;
    expect(morph.timing.duration).toBe(0.5);
    expect(morph.timing.easing).toBe("linear");
  });

  test("a parent's unknown timing key reaches the child", () => {
    const program = compile(["morph child as base {", "  blend = cut", "}"], { ...BASE_STRUCT, timing: { ...BASE_STRUCT.timing, trigger: "speech" } });
    expect(program.context!["morph"]!["child"]!.timing.trigger).toBe("speech");
  });
});
