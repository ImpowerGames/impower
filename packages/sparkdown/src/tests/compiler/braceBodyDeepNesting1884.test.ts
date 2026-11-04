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

  const firstChild = (head: string) => {
    const { program, errors } = compile(
      twoStructs("layout", `row { ${head} "Over"; text "after" }`),
    );
    const [row] = layoutTree(program, "first").children;
    return { child: row.children[0], errors, second: layoutTree(program, "second") };
  };

  const wrap = (depth: number, inner: string) =>
    "f(".repeat(depth) + inner + ")".repeat(depth);

  test.each([
    ["a function whose body returns two values", (d: number) => `card(${wrap(d, "1")}, function(a, b) return a, b end)`],
    ["a method call and a table", (d: number) => `card(${wrap(d, "t:m({ a = 1 })")})`],
    ["an event's operators and a string", (d: number) => `button @click=${wrap(d, 'x .. "a,b" + 1')}`],
    ["a prop suffix", (d: number) => `text #x=${wrap(d, "1")}+2 .wide`],
    ["a prop with a comma inside it", (d: number) => `text #x=${wrap(d, "1")},red .wide`],
    ["a prop with a braced suffix", (d: number) => `text #x=${wrap(d, "1")}+{a=1} .wide`],
    ["a prop holding a backtick string with a brace", (d: number) => `text #x=${wrap(d, "`}`")}`],
    ["a prop holding a quoted closer", (d: number) => `text #x=${wrap(d, '")}"')}`],
  ])("%s lowers at depth seven as it does at depth one", (_, head) => {
    const shallow = firstChild(head(1));
    const deep = firstChild(head(7));
    expect(shallow.errors).toEqual([]);
    expect(deep.errors).toEqual([]);
    const asShallow = JSON.stringify(deep.child)
      .split("f(".repeat(7))
      .join("f(")
      .split(")".repeat(7))
      .join(")");
    expect(JSON.parse(asShallow)).toEqual(shallow.child);
    expect(deep.second.children.map((c: any) => c.tag)).toEqual(["text"]);
  });

  const LINE = 8;
  const headColumn = (head: string, at: string) => `  row { ${head}`.indexOf(at);

  test.each([
    ["an operator", "1 + 2", " +"],
    ["a space before the closer", "1 ", " )"],
    ["a double-quoted string", '"a b"', " b"],
    ["a single-quoted string", "'a b'", " b"],
    ["a backtick string holding a brace", "`a }`", " }"],
    ["a quoted closer and a later part", '"a )}" 2', " )"],
    ["a table", "{a = 1}", " ="],
    ["a call after the space", "1 g(2) 3", " g"],
  ])("a prop holding %s ends its value at the whitespace at depth seven as at depth one", (_, inner, after) => {
    const head = (d: number) => `text #x=${wrap(d, inner)} .wide`;
    const shallow = firstChild(head(1));
    const deep = firstChild(head(7));
    for (const [d, side] of [[1, shallow], [7, deep]] as const) {
      expect(side.errors.length).toBeGreaterThan(0);
      expect(side.errors.every((e) => e.line === LINE && e.message === "Invalid syntax")).toBe(true);
      expect(side.errors[0]!.character).toBe(headColumn(head(d), after) + 1);
      expect(side.child.classes).toEqual(["wide"]);
      expect(side.child.content).toEqual([{ kind: "literal", text: "Over" }]);
      expect(side.second.children.map((c: any) => c.tag)).toEqual(["text"]);
    }
    expect(deep.child.props.x.value.split("f(".repeat(7)).join("f(")).toBe(shallow.child.props.x.value);
  });

  test("a top-level backtick string with whitespace before a deep group ends the value as at depth one", () => {
    const head = (d: number) => `text #x=\`a b\`+${wrap(d, "1")}`;
    const shallow = firstChild(head(1));
    const deep = firstChild(head(7));
    expect(deep.child.props.x).toEqual(shallow.child.props.x);
    expect(shallow.errors[0]!.character).toBe(headColumn(head(1), " b") + 1);
    expect(deep.errors[0]!.character).toBe(headColumn(head(7), " b") + 1);
    expect(deep.child.content).toEqual([{ kind: "literal", text: "Over" }]);
  });

  test.each([
    ["after the call", (d: number) => `button @click=${wrap(d, "1")},g`, (d: number) => wrap(d, "1").length],
    ["before the call", (d: number) => `button @click=g,${wrap(d, "1")}`, () => 1],
  ])("an event value with a comma %s reports the comma at depth seven as at depth one", (_, head, commaAt) => {
    for (const d of [1, 7]) {
      const { errors, child, second } = firstChild(head(d));
      expect(errors).toEqual([
        { line: LINE, character: headColumn(head(d), "=") + 1 + commaAt(d), message: "Invalid syntax" },
      ]);
      expect(child.content).toEqual([{ kind: "literal", text: "Over" }]);
      expect(second.children.map((c: any) => c.tag)).toEqual(["text"]);
    }
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
