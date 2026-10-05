import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story } from "../../inkjs/engine/Story";

const URI = "inmemory:///definition-properties-580.sd";

function compile(source: string, skipValidation = false) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    skipValidation,
    files: [{
      uri: URI,
      type: "script",
      name: "definition-properties-580",
      ext: "sd",
      text: source,
      version: 1,
      languageId: "sparkdown",
    }],
  });
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  const diagnostics = (program.diagnostics?.[URI] ?? []).map((diagnostic) => ({
    ...diagnostic,
    message: typeof diagnostic.message === "string"
      ? diagnostic.message
      : diagnostic.message.value,
  }));
  return { program, diagnostics };
}

const ROOT = `define Bird with
  name = ""
  timing = { duration = 0 }
  keyframes = { { opacity = "0" } }
end
`;

describe("definition property validation (#580)", () => {
  test("an unknown top-level property warns at its key without changing the value", () => {
    const { program, diagnostics } = compile(`${ROOT}define robin as Bird with
  impossible_property = 7
end
`);
    expect(program.context?.["Bird"]?.["robin"]?.impossible_property).toBe(7);
    const warning = diagnostics.find((d) => d.message.startsWith(
      "Cannot add property `impossible_property` to Bird `robin`.",
    ));
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe(2);
    expect(warning?.range).toEqual({
      start: { line: 6, character: 2 },
      end: { line: 6, character: 21 },
    });
    expect(warning?.message).toContain("declare impossible_property");
    expect(warning?.message).not.toContain("Did you mean");
  });

  test("an inline table typo warns at its nested key with a suggestion", () => {
    const { program, diagnostics } = compile(`${ROOT}define robin as Bird with
  timing = { durration = 1 }
end
`);
    expect(program.context?.["Bird"]?.["robin"]?.timing?.durration).toBe(1);
    const warning = diagnostics.find((d) => d.message.startsWith(
      "Cannot add property `durration` to Bird `robin`. Did you mean `duration`?",
    ));
    expect(warning).toBeDefined();
    expect(warning?.range).toEqual({
      start: { line: 6, character: 13 },
      end: { line: 6, character: 22 },
    });
  });

  test("a list item's unknown property warns wherever the type describes its shape", () => {
    const { diagnostics } = compile(`${ROOT}define robin as Bird with
  keyframes = { { opacity = "1", misspelled = 1 } }
end
`);
    const warning = diagnostics.find((d) => d.message.startsWith(
      "Cannot add property `misspelled` to Bird `robin`.",
    ));
    expect(warning).toBeDefined();
    expect(warning?.range).toEqual({
      start: { line: 6, character: 33 },
      end: { line: 6, character: 43 },
    });
  });

  test("a root define and known inherited properties do not warn", () => {
    const { diagnostics } = compile(`${ROOT}define robin as Bird with
  name = "Robin"
  timing = { duration = 1 }
end
`);
    expect(diagnostics.filter((d) => d.message.startsWith("Cannot add property"))).toEqual([]);
  });

  test("skipValidation suppresses the property warning", () => {
    const { diagnostics } = compile(`${ROOT}define robin as Bird with
  impossible_property = 7
end
`, true);
    expect(diagnostics.filter((d) => d.message.startsWith("Cannot add property"))).toEqual([]);
  });

  test.each(["define fade as animation", "animation fade"])(
    "%s checks the built-in timing shape",
    (header) => {
      const body = header.startsWith("define")
        ? "  timing = { durration = 1 }"
        : "  timing {\n    durration = 1\n  }";
      const { diagnostics } = compile(`${header} with\n${body}\nend\n`);
      const warning = diagnostics.find((d) => d.message.startsWith(
        "Cannot add property `durration` to animation `fade`. Did you mean `duration`?",
      ));
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe(2);
      expect(warning?.range).toEqual(header.startsWith("define")
        ? { start: { line: 1, character: 13 }, end: { line: 1, character: 22 } }
        : { start: { line: 2, character: 4 }, end: { line: 2, character: 13 } });
    },
  );

  test("an empty known type is closed", () => {
    const { diagnostics } = compile("define ui_test as config with\n  anything = 1\nend\n");
    expect(diagnostics.some((d) => d.message.startsWith(
      "Cannot add property `anything` to config `ui_test`.",
    ))).toBe(true);
  });

  test("recursive types accept arbitrary nested keys", () => {
    const { diagnostics } = compile("define arbitrary as style with\n  anything = { nested = 1 }\nend\n");
    expect(diagnostics.filter((d) => d.message.startsWith("Cannot add property"))).toEqual([]);
  });

  test("an unmarked typo on an intermediate definition remains unknown in its child", () => {
    const { diagnostics } = compile(`${ROOT}define robin as Bird with
  typo = 1
end
define child as robin with
  typo = 2
end
`);
    expect(diagnostics.filter((d) => d.message.startsWith("Cannot add property `typo`"))
      .map((d) => d.message)).toEqual([
        "Cannot add property `typo` to Bird `robin`. Use `declare typo` to add it on purpose.",
        "Cannot add property `typo` to robin `child`. Use `declare typo` to add it on purpose.",
      ]);
  });

  test("incremental edits move warning ranges without mutating a previous program", () => {
    const source = `${ROOT}define robin as Bird with\n  impossible_property = 7\nend\n`;
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [{
      uri: URI, type: "script", name: "main", ext: "sd", text: source,
      version: 1, languageId: "sparkdown",
    }] });
    const before = compiler.compile({ textDocument: { uri: URI } }).program;
    const beforeFrom = before.definitionProperties?.find((d) => d.name === "robin")?.from;
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        text: "-- inserted comment\n",
      }],
    });
    const after = compiler.compile({ textDocument: { uri: URI } }).program;
    expect(before.definitionProperties?.find((d) => d.name === "robin")?.from).toBe(beforeFrom);
    const warning = after.diagnostics?.[URI]?.find((d) => (
      typeof d.message === "string" ? d.message : d.message.value
    ).startsWith("Cannot add property `impossible_property`"));
    expect(warning?.range).toEqual({
      start: { line: 7, character: 2 }, end: { line: 7, character: 21 },
    });
  });

  test("a flagged property still reaches the runtime table", () => {
    const { program, diagnostics } = compile(`external host_record(v)
${ROOT}define robin as Bird with
  impossible_property = 7
end
& host_record(Bird.robin.impossible_property)
done
`);
    expect(program.compiled).toBeDefined();
    const story = new Story(program.compiled!);
    const recorded: unknown[] = [];
    const errors: string[] = [];
    story.BindExternalFunction("host_record", (value: unknown) => recorded.push(value));
    story.onError = (message: string) => errors.push(message);
    story.ContinueMaximally();
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7]);
    expect(diagnostics.some((d) => d.message.startsWith(
      "Cannot add property `impossible_property` to Bird `robin`.",
    ))).toBe(true);
  });
});
