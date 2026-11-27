import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";
import { guideExamples } from "./guideExamples";

function layoutAst(source: string): any {
  const entries = compileSource(source);
  return entries.find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
}

const element = (tag: string, children: unknown[] = [], props: Record<string, unknown> = {}) => ({
  kind: "element",
  tag,
  classes: [],
  props,
  events: [],
  children,
});

const CLEAR = { clear: { kind: "literal", value: true } };

describe("the cast element (#2746)", () => {
  test("a cast with a two-level template compiles to a cast node holding the template", () => {
    const ast = layoutAst(`layout main {
  stage {
    cast {
      actor {
        portrait #clear { image }
      }
    }
  }
}
`);
    const stage = ast.main.children[0];
    expect(stage).toMatchObject({ kind: "element", tag: "stage" });
    expect(stage.children).toEqual([
      {
        ...element("cast"),
        templates: [element("actor", [element("portrait", [element("image")], CLEAR)])],
      },
    ]);
  });

  test("the guide's cast layout and style compile together with no diagnostics", () => {
    const examples = guideExamples("Streams.md")
      .map((example) => example.code)
      .filter((code) => code.includes("cast {") || code.includes("style actor"));
    expect(examples).toHaveLength(2);
    const uri = "file:///main.sd";
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri, type: "script", name: "main", ext: "sd", text: `${examples.join("\n")}\nscene start\n  Hello.\nend\n`, version: 1, languageId: "sparkdown" },
      ] as never,
    });
    const program = compiler.compile({ textDocument: { uri } }).program;
    expect(program.diagnostics?.[uri] ?? []).toEqual([]);
    expect(program.sparkle?.layouts?.["main"]?.children[0]).toMatchObject({
      tag: "stage",
      children: [{ tag: "backdrop" }, { tag: "cast", templates: [{ tag: "actor" }] }],
    });
  });

  test("a cast with a one-level template compiles to a cast node holding the picture element", () => {
    const ast = layoutAst(`layout main {
  stage {
    cast { portrait #clear { image } }
  }
}
`);
    expect(ast.main.children[0].children).toEqual([
      {
        ...element("cast"),
        templates: [element("portrait", [element("image")], CLEAR)],
      },
    ]);
  });
});
