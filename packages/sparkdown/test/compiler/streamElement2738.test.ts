import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
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
        kind: "element",
        tag: "stream",
        classes: [],
        props: {},
        events: [],
        children: [],
        templates: [
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

describe("a stream keeps the settings written on it (#2738)", () => {
  test("its classes, inline props and block props compile onto the stream node", () => {
    const ast = layoutAst(`layout phone {
  stream.feed #height=44px #overflow=scroll {
    gap = 8px
    dialogue.bubble { text }
  }
}
`);
    const stream = ast.phone.children[0];
    expect(stream).toMatchObject({ kind: "element", tag: "stream", children: [] });
    expect(stream.classes).toEqual(["feed"]);
    expect(stream.props).toEqual({
      height: { kind: "literal", value: "44px" },
      overflow: { kind: "literal", value: "scroll" },
      gap: { kind: "literal", value: "8px" },
    });
    expect(stream.templates.map((child: any) => child.tag)).toEqual(["dialogue"]);
  });
});

describe("a stream says what it ignores (#2738)", () => {
  test("text on the stream and children that are not elements each get a warning, and the templates still compile", () => {
    const source = `layout phone {
  stream "hello" {
    for i = 1, 2 do
      action { text }
    end
    stream {
      action { text }
    }
    dialogue { text }
  }
}
`;
    expect(diagnosticsFor(source).filter((m) => m.includes("stream"))).toEqual([
      "A stream shows the lines that go to it, so text written on the stream itself is ignored.",
      "A stream copies only the elements written directly inside it, so this `for` is ignored.",
      "A stream copies only the elements written directly inside it, so this `stream` is ignored.",
    ]);
    const stream = layoutAst(source).phone.children[0];
    expect(stream.templates.map((child: any) => child.tag)).toEqual(["dialogue"]);
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
