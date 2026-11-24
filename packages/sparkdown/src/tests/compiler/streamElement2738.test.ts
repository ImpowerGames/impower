import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { compileSource } from "./compileSnapshot";

function layoutAst(source: string): any {
  const entries = compileSource(source);
  return entries.find((e) => e.block?.sparkle?.layouts)?.block?.sparkle?.layouts;
}

function diagnosticsFor(source: string): string[] {
  const uri = "file:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ] as never,
  });
  const program = compiler.compile({ textDocument: { uri } }).program;
  return (program.diagnostics?.[uri] ?? []).map((d) =>
    typeof d.message === "string" ? d.message : d.message.value,
  );
}

describe("the stream element (#2738)", () => {
  test("a layout with a stream and two templates compiles to a stream node holding both templates", () => {
    const ast = layoutAst(`layout phone {
  thread {
    stream {
      dialogue.bubble { text }
      action.note { text }
    }
  }
}
`);
    const thread = ast.phone.children[0];
    expect(thread).toMatchObject({ kind: "element", tag: "thread" });
    expect(thread.children).toEqual([
      {
        kind: "stream",
        children: [
          {
            kind: "element",
            tag: "dialogue",
            classes: ["bubble"],
            props: {},
            events: [],
            children: [
              { kind: "element", tag: "text", classes: [], props: {}, events: [], children: [] },
            ],
          },
          {
            kind: "element",
            tag: "action",
            classes: ["note"],
            props: {},
            events: [],
            children: [
              { kind: "element", tag: "text", classes: [], props: {}, events: [], children: [] },
            ],
          },
        ],
      },
    ]);
  });
});

describe("clear names a layout with a stream (#2738)", () => {
  const LAYOUTS = `layout phone {
  stream {
    dialogue { text }
  }
}

layout card {
  dialogue { text }
}
`;
  const inStart = (line: string) => `${LAYOUTS}\nscene start\n  ${line}\nend\n`;

  test("clearing a layout that holds a stream, or the textstream page, is quiet", () => {
    expect(diagnosticsFor(inStart("[[clear phone]]"))).toEqual([]);
    expect(diagnosticsFor(inStart("[[clear textstream]]"))).toEqual([]);
  });

  test("clearing a layout with no stream warns that it has none", () => {
    expect(diagnosticsFor(inStart("[[clear card]]"))).toEqual([
      "`card` has no stream to clear.",
    ]);
    expect(diagnosticsFor(inStart("[[clear textbox]]"))).toEqual([
      "`textbox` has no stream to clear.",
    ]);
  });
});
