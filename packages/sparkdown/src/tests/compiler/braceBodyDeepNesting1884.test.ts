import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { MAIN_URI, programCompiler } from "../program/programHarness";
import { parseSource } from "./grammarSnapshot";

function nestedCall(depth: number): string {
  let value = "1";
  for (let i = 0; i < depth; i++) {
    value = `f(${value})`;
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

const DECLARATIONS = [
  "component card(t) {",
  "  slot",
  "}",
  "",
  "function f(x)",
  "  return x",
  "end",
  "",
].join("\n");

function compile(source: string): {
  program: SparkProgram;
  errors: { line: number; character: number; message: string }[];
} {
  const { program } = programCompiler({
    [MAIN_URI]: `${DECLARATIONS}${source}\nscene start\n  Hi.\nend\n`,
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

const DEPTHS = [7, 8, 12, 20];

const POSITIONS: [string, (depth: number) => string][] = [
  ["call arguments", (depth) => `card(${nestedCall(depth - 1)})`],
  ["an event value", (depth) => `button @click=${nestedCall(depth)}`],
  ["a prop value", (depth) => `text #x=${nestedCall(depth)}`],
];

describe("a struct brace body closes at its own } however deep a line's parentheses nest", () => {
  for (const keyword of ["layout", "component"]) {
    const node = keyword === "layout" ? "LuauLayout" : "LuauComponent";
    for (const [position, head] of POSITIONS) {
      test.each(DEPTHS)(`${keyword}: ${position} nested %i deep`, (depth) => {
        const source = twoStructs(keyword, `row { ${head(depth)} "Over"; text "after" }`);
        expect(topLevelNames(source)).toEqual([node, node]);
      });
    }
  }

  test.each(POSITIONS)("an unclosed parenthesis in %s stops before the block's `}`", (_, head) => {
    const line = head(1).replace(/[)]+$/, "");
    const source = twoStructs("layout", `row { ${line} "Over"; text "after" }`);
    expect(topLevelNames(source)).toEqual(["LuauLayout", "LuauLayout"]);
  });

  test.each(POSITIONS)("an unclosed parenthesis in %s ends at its line", (_, head) => {
    const line = head(8).replace(/[)]+$/, "");
    const { program } = compile(
      ["layout first {", `  ${line}`, '  text "after"', "}", "", "layout second {", '  text "x"', "}"].join(
        "\n",
      ),
    );
    const children = layoutTree(program, "first").children;
    expect(children.map((c: any) => c.tag)).toEqual([line.split(/[ (]/)[0], "text"]);
    expect(children[1].content).toEqual([{ kind: "literal", text: "after" }]);
    expect(layoutTree(program, "second").children.map((c: any) => c.tag)).toEqual([
      "text",
    ]);
  });

  test.each([7, 12])("deep values nested %i deep lower as their shallow forms do", (depth) => {
    const deep = nestedCall(depth);
    const { program, errors } = compile(
      twoStructs(
        "layout",
        `row { card(${nestedCall(depth - 1)}) "A"; button @click=${deep} "B"; text #x=${deep} "C"; text "after" }`,
      ),
    );
    expect(errors).toEqual([]);
    const [row] = layoutTree(program, "first").children;
    const [call, button, text, after] = row.children;
    expect(call.params).toEqual([
      { kind: "binding", binding: { source: nestedCall(depth - 1) } },
    ]);
    expect(call.content).toEqual([{ kind: "literal", text: "A" }]);
    expect(button.events).toEqual([
      {
        event: "click",
        handler: { kind: "call", binding: { source: deep, params: ["event"] } },
      },
    ]);
    expect(button.content).toEqual([{ kind: "literal", text: "B" }]);
    expect(text.props).toEqual({ x: { kind: "literal", value: deep } });
    expect(text.content).toEqual([{ kind: "literal", text: "C" }]);
    expect(after.content).toEqual([{ kind: "literal", text: "after" }]);
    expect(layoutTree(program, "second").children.map((c: any) => c.tag)).toEqual([
      "text",
    ]);
  });

  test.each([
    ["a closure", "{ f(1) }"],
    ["a closure nested past the brace scan", "{ t = {a={b={c={d={e={f={g={h={}}}}}}}}} }"],
  ])("a deep value beside a shallow value and after %s keeps every part", (_, handler) => {
    const deep = nestedCall(8);
    const { program, errors } = compile(
      twoStructs(
        "layout",
        `row { button @click=${handler} #y=f(1) #x=${deep} .wide "Over"; text "after" }`,
      ),
    );
    expect(errors).toEqual([]);
    const [row] = layoutTree(program, "first").children;
    const [button, after] = row.children;
    expect(button.classes).toEqual(["wide"]);
    expect(button.events.map((e: any) => [e.event, e.handler.kind])).toEqual([
      ["click", "closure"],
    ]);
    expect(button.props).toEqual({
      y: { kind: "literal", value: "f(1)" },
      x: { kind: "literal", value: deep },
    });
    expect(button.content).toEqual([{ kind: "literal", text: "Over" }]);
    expect(after.content).toEqual([{ kind: "literal", text: "after" }]);
  });

  test("a `--` in a deep prop value is text, as in a shallow one", () => {
    const deep = `var(${nestedCall(7).replace("1", "--accent")})`;
    const { program, errors } = compile(
      twoStructs("layout", `row { text #x=${deep} "Over"; text "after" }`),
    );
    expect(errors).toEqual([]);
    const [row] = layoutTree(program, "first").children;
    const [text, after] = row.children;
    expect(text.props).toEqual({ x: { kind: "literal", value: deep } });
    expect(text.content).toEqual([{ kind: "literal", text: "Over" }]);
    expect(after.content).toEqual([{ kind: "literal", text: "after" }]);
    expect(layoutTree(program, "second").children.map((c: any) => c.tag)).toEqual([
      "text",
    ]);
  });

  test("a deep event value on a continuation line joins its element", () => {
    const deep = nestedCall(9);
    const { program, errors } = compile(
      ["layout first {", '  button "Go"', `    @click=${deep}`, '  text "after"', "}"].join(
        "\n",
      ),
    );
    expect(errors).toEqual([]);
    const [button, after] = layoutTree(program, "first").children;
    expect(button.content).toEqual([{ kind: "literal", text: "Go" }]);
    expect(button.events).toEqual([
      {
        event: "click",
        handler: { kind: "call", binding: { source: deep, params: ["event"] } },
      },
    ]);
    expect(after.content).toEqual([{ kind: "literal", text: "after" }]);
  });
});
