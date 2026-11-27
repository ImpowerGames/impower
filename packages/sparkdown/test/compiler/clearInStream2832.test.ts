import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";

const CLEAR_IN_STREAM =
  "A stream entry keeps its content for as long as the entry stays, so `#clear` has no effect inside a stream.";

function clearDiagnostics(source: string) {
  const uri = "file:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ] as never,
  });
  const program = compiler.compile({ textDocument: { uri } }).program;
  const lines = source.split("\n");
  return (program.diagnostics?.[uri] ?? [])
    .map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      text: lines[d.range.start.line]!.slice(d.range.start.character, d.range.end.character),
      line: d.range.start.line,
    }))
    .filter((d) => d.message.includes("clear"));
}

describe("#clear inside a stream (#2832)", () => {
  test("a #clear on a stream template warns at the prop", () => {
    expect(
      clearDiagnostics(`layout phone {
  thread {
    stream {
      dialogue.bubble #clear { text }
    }
  }
}
`),
    ).toEqual([{ message: CLEAR_IN_STREAM, text: "#clear", line: 3 }]);
  });

  test("a #clear on an element nested deeper inside a template warns at the prop", () => {
    expect(
      clearDiagnostics(`layout phone {
  stream {
    dialogue.bubble {
      box {
        text #clear
      }
    }
  }
}
`),
    ).toEqual([{ message: CLEAR_IN_STREAM, text: "#clear", line: 4 }]);
  });

  test("a #clear outside any stream compiles without the warning", () => {
    expect(
      clearDiagnostics(`layout phone {
  thread {
    dialogue.bubble #clear { text }
    stream {
      action.note { text }
    }
  }
}
`),
    ).toEqual([]);
  });
});
