import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { MAIN_URI, programCompiler } from "../program/programHarness";
import { parseSource } from "./grammarSnapshot";

function nestedTable(depth: number): string {
  let value = "{}";
  for (let i = 1; i < depth; i++) {
    value = `{k${i}=${value}}`;
  }
  return value;
}

function topLevelNames(source: string): string[] {
  const cursor = parseSource(source).topNode.cursor();
  const names: string[] = [];
  if (cursor.firstChild()) {
    do {
      if (cursor.name !== "Newline") names.push(cursor.name);
    } while (cursor.nextSibling());
  }
  return names;
}

function compile(source: string): {
  program: SparkProgram;
  errors: { line: number; character: number; message: string }[];
} {
  const { program } = programCompiler({
    [MAIN_URI]: `${source}\nscene start\n  Hi.\nend\n`,
  }).compile();
  const errors: { line: number; character: number; message: string }[] = [];
  for (const diagnostics of Object.values(program.diagnostics ?? {})) {
    for (const d of diagnostics as any[]) {
      if (d.severity !== 1) continue;
      errors.push({
        line: d.range?.start?.line,
        character: d.range?.start?.character,
        message: typeof d.message === "string" ? d.message : d.message?.value,
      });
    }
  }
  return { program, errors };
}

const strip = (value: unknown): any =>
  JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === "span" || key === "exprId" ? undefined : v,
    ),
  );

const layoutTree = (program: SparkProgram, name: string) =>
  strip((program as any).sparkle?.layouts?.[name]);

const twoStructs = (keyword: string, line: string) =>
  [
    `${keyword} first {`,
    `  ${line}`,
    "}",
    "",
    `${keyword} second {`,
    '  text "x"',
    "}",
    "",
  ].join("\n");

const DEPTHS = [8, 9, 12, 20];

describe("a struct brace body closes at its own } however deep an inner value nests", () => {
  for (const keyword of ["layout", "component"]) {
    const node = keyword === "layout" ? "LuauLayout" : "LuauComponent";

    test.each(DEPTHS)(`${keyword}: an event handler holding a depth-%i table`, (depth) => {
      const source = twoStructs(
        keyword,
        `row { button @click={ t = ${nestedTable(depth)} } "Over"; text "after" }`,
      );
      expect(topLevelNames(source)).toEqual([node, node]);
    });

    test.each(DEPTHS)(`${keyword}: a prop holding a depth-%i table`, (depth) => {
      const source = twoStructs(
        keyword,
        `row { button #items=${nestedTable(depth)} "Over"; text "after" }`,
      );
      expect(topLevelNames(source)).toEqual([node, node]);
    });
  }

  test.each(DEPTHS)("style: a property holding a depth-%i table", (depth) => {
    const source = `style first {\n  t = ${nestedTable(depth)}\n}\n\nstyle second {\n  x = 1\n}\n`;
    expect(topLevelNames(source)).toEqual(["LuauStyle", "LuauStyle"]);
  });

  test("a deep handler and a deep prop lower with the parts after them", () => {
    const deep = nestedTable(12);
    const { program, errors } = compile(
      [
        "layout first {",
        `  row { button @click={ t = ${deep} } #items=${deep} "Over"; text "after" }`,
        "}",
        "",
        "layout second {",
        '  text "x"',
        "}",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    const [row] = layoutTree(program, "first").children;
    expect(row.children.map((c: any) => c.tag)).toEqual(["button", "text"]);
    const [button, after] = row.children;
    expect(button.content).toEqual([{ kind: "literal", text: "Over" }]);
    expect(button.events.map((e: any) => [e.event, e.handler.kind])).toEqual([
      ["click", "closure"],
    ]);
    expect(button.props.items).toEqual({
      kind: "binding",
      binding: { source: deep },
    });
    expect(after.content).toEqual([{ kind: "literal", text: "after" }]);
    expect(layoutTree(program, "second").children.map((c: any) => c.tag)).toEqual([
      "text",
    ]);
  });

  test("a prop's braces may continue onto later lines and close there", () => {
    const { program, errors } = compile(
      [
        "layout first {",
        "  row {",
        "    text #items={",
        "      {a = 1, b = 2}",
        '    } "Over"',
        '    text "after"',
        "  }",
        "}",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    const [row] = layoutTree(program, "first").children;
    expect(row.children.map((c: any) => c.tag)).toEqual(["text", "text"]);
    expect(row.children[0].props.items).toEqual({
      kind: "binding",
      binding: { source: "{\n      {a = 1, b = 2}\n    }" },
    });
    expect(row.children[0].content).toEqual([{ kind: "literal", text: "Over" }]);
    expect(row.children[1].content).toEqual([{ kind: "literal", text: "after" }]);
  });

  test("a prop whose braces never close is reported on its `{`", () => {
    const { errors } = compile(
      ["layout first {", "  row {", "    text #items={ {a = 1}"].join("\n"),
    );
    expect(errors).toContainEqual({
      line: 2,
      character: 16,
      message:
        "This prop's value is missing its closing `}`. Without it, the value runs to the next line that starts with `end`, `else`, `elseif` or `case`, the next `scene` or `branch`, or the end of the file.",
    });
  });

  test("an unfinished expression inside a prop's braces that span lines is reported once, where Luau stops", () => {
    const { errors } = compile(
      ["layout first {", "  text #items={", "    1 +", "  }", "}"].join("\n"),
    );
    expect(errors).toEqual([
      {
        line: 3,
        character: 2,
        message: "Expected identifier when parsing expression, got '}'",
      },
    ]);
  });

  test("an unfinished expression inside a prop nested past eight braces is reported once", () => {
    const { errors } = compile(
      [
        "layout first {",
        "  text #items={ {a={b={c={d={e={f={g={h={i=1 +}}}}}}}}} }",
        "}",
      ].join("\n"),
    );
    expect(errors).toEqual([
      {
        line: 1,
        character: 46,
        message: "Expected identifier when parsing expression, got '}'",
      },
    ]);
  });

  test.each([
    ["nothing", []],
    ["only a line comment", ["    -- just a comment"]],
    ["only a block comment", ["    --[[ only a comment ]]"]],
  ])("a prop's braces that hold %s across lines are reported on the braces", (_, inner) => {
    const { errors } = compile(
      ["layout first {", "  text #items={", ...inner, "  }", "}"].join("\n"),
    );
    expect(errors).toEqual([
      {
        line: 1,
        character: 14,
        message:
          "This prop's braces hold no expression; write its value between `{` and `}`.",
      },
    ]);
  });
});
