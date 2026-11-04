import { describe, expect, test } from "vitest";
import { MAIN_URI, programCompiler } from "@impower/sparkdown/src/tests/program/programHarness";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import { tokenize } from "@impower/sparkdown/src/tests/compiler/vscodeGrammarSnapshot";
import { formatSource } from "./formatSource";

const PREFIX = "component card(t) {\n  slot\n}\nfunction f(x)\n  return x\nend\n";
const ROW_LINE = 7;

const wrap = (d: number, inner: string) => "f(".repeat(d) + inner + ")".repeat(d);
const open = (d: number, inner: string) => "f(".repeat(d) + inner;
const collapse = (text: string, d: number) =>
  d === 1 ? text : text.split("f(".repeat(d)).join("f(").split(")".repeat(d)).join(")");

const source = (head: string) =>
  `${PREFIX}layout first {\n  row { ${head} .wide "Over"; text "after" }\n  text "tail"\n}\nlayout second { text "x" }\nscene start\n  Hi.\nend\n`;

interface Family {
  name: string;
  head: (d: number) => string;
  value: (d: number) => string;
  depths: number[];
}

const families: Family[] = [];
const DEPTHS = [1, 7, 12];
const INNERS: [string, string][] = [
  ["a string holding a space", '1, "a b"'],
  ["a double-quoted closer", '"a )}"'],
  ["a single-quoted closer", "'a )}'"],
  ["a backtick closer", "`a )}`"],
  ["a long bracket", "[[a )}]]"],
  ["a long bracket with equals", "[=[a )}]=]"],
  ["a closed long comment", "1 --[[ a )} ]] + 2"],
  ["a long comment with equals", "1 --[=[ a )} ]=] + 2"],
  ["a line comment", "1 -- a )}"],
  ["an interpolated string", "`a {f(1)} b`"],
];
for (const [label, inner] of INNERS) {
  families.push({ name: `call holding ${label}`, head: (d) => `card(${wrap(d, inner)})`, value: (d) => wrap(d, inner), depths: DEPTHS });
  families.push({ name: `event holding ${label}`, head: (d) => `button @click=${wrap(d, inner)}`, value: (d) => wrap(d, inner), depths: DEPTHS });
}
const UNCLOSED_DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 12];
families.push({ name: "unclosed call", head: (d) => `card(${open(d, "1")}`, value: (d) => open(d, "1"), depths: UNCLOSED_DEPTHS });
families.push({ name: "unclosed event", head: (d) => `button @click=${open(d, "1")}`, value: (d) => open(d, "1"), depths: UNCLOSED_DEPTHS });
families.push({ name: "unclosed prop", head: (d) => `text #x=${open(d, "1")}`, value: (d) => open(d, "1"), depths: UNCLOSED_DEPTHS });
const ADJACENT = ["#y={f(2)} @hover={ f(3) }", "#y=`hi {f(2)}` @hover=f(3)", "@hover={\n f(3)\n} #y={\n f(2)\n}"];
for (const [kind, lead] of [["call", (d: number) => `card(${wrap(d, "1")})`], ["event", (d: number) => `button @click=${wrap(d, "1")}`], ["prop", (d: number) => `text #x=${wrap(d, "1")}`]] as const) {
  for (const attrs of ADJACENT) {
    families.push({ name: `${kind} beside ${JSON.stringify(attrs)}`, head: (d) => `${lead(d)} ${attrs}`, value: (d) => wrap(d, "1"), depths: DEPTHS });
  }
}
for (const inner of ["1 + 2", '"a b"', "'a b'", "`a }`", "1 g(2) 3", '"a )}" 2', "[[a b]]", "[=[a )}]=]"]) {
  families.push({ name: `prop holding ${JSON.stringify(inner)}`, head: (d) => `text #x=${wrap(d, inner)}`, value: (d) => wrap(d, inner), depths: DEPTHS });
}
for (const suffix of [",g", "x", "+{a=1}"]) {
  families.push({ name: `event with suffix ${JSON.stringify(suffix)}`, head: (d) => `button @click=${wrap(d, "1")}${suffix}`, value: (d) => wrap(d, "1"), depths: DEPTHS });
}

const strip = (value: unknown) =>
  JSON.stringify(value, (key, v) => (key === "span" || key === "exprId" ? undefined : v));

function topLevel(text: string): string[] {
  const names: string[] = [];
  const cursor = parseSource(text).topNode.cursor();
  if (cursor.firstChild()) {
    do {
      if (cursor.name !== "Newline") names.push(cursor.name);
    } while (cursor.nextSibling());
  }
  return names;
}

async function rowScopes(text: string, value: string, d: number, shallowValue: string): Promise<string[]> {
  const dumps = await tokenize(text);
  const row = dumps.find((l) => l.lineNumber === ROW_LINE + 1)!;
  const chars: string[] = [];
  for (const t of row.tokens) {
    for (let i = t.startIndex; i < t.endIndex; i++) {
      chars[i] = t.scopes.filter((s, k) => s !== t.scopes[k - 1]).join(" ");
    }
  }
  const start = row.lineText.indexOf(value);
  const keep = (i: number) => {
    if (d === 1 || i < start || i >= start + value.length) return true;
    const offset = i - start;
    const prefixLength = 2 * d;
    if (offset < prefixLength) return offset < 2;
    const closersFrom = value.length - (value.endsWith(")".repeat(d)) && shallowValue.endsWith(")") ? d : 0);
    if (offset >= closersFrom) return offset === closersFrom;
    return true;
  };
  return chars.filter((_, i) => keep(i));
}

async function read(family: Family, d: number) {
  const text = source(family.head(d));
  const { program } = programCompiler({ [MAIN_URI]: text }).compile();
  const errors = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((x: any) => x.severity === 1)
    .map((x: any) => (typeof x.message === "string" ? x.message : x.message?.value));
  const formatted = formatSource(text);
  return {
    text,
    lowered: strip((program as any).sparkle),
    errors,
    top: topLevel(text),
    formatted,
    reformatted: formatSource(formatted),
    scopes: await rowScopes(text, family.value(d), d, family.value(1)),
  };
}

describe("a prop with a binding prefix before a call", () => {
  test.each(["{f(2)}+", "{{f(2)}}+", "{1}+", "`{f(2)}`+"])("`%s…` lowers at depth seven as at depth one", (prefix) => {
    const lower = (d: number) => {
      const { program } = programCompiler({ [MAIN_URI]: source(`text #x=${prefix}${wrap(d, "1")}`) }).compile();
      return strip((program as any).sparkle?.layouts?.first);
    };
    expect(collapse(lower(7), 7)).toBe(lower(1));
  });

  test("`{f(2)}+f(…)` is a binding at every depth", () => {
    for (const d of [1, 7]) {
      const { program } = programCompiler({ [MAIN_URI]: source(`text #x={f(2)}+${wrap(d, "1")}`) }).compile();
      const text = (program as any).sparkle.layouts.first.children[0].children[0];
      expect(text.props.x.kind).toBe("binding");
      expect(text.props.x.binding.source).toBe("{f(2)}");
    }
  });
});

describe("an event operator after a call", () => {
  test.each(["+2", "*2", "+{a=1}"])("`f(…)%s` formats at depth seven as at depth one and stays one value", (suffix) => {
    const head = (d: number) => `button @click=${wrap(d, "1")}${suffix}`;
    const formatted = (d: number) => formatSource(source(head(d)));
    expect(collapse(formatted(7), 7)).toBe(formatted(1));
    for (const d of [1, 7]) {
      const { program } = programCompiler({ [MAIN_URI]: formatted(d) }).compile();
      const errors = Object.values(program.diagnostics ?? {}).flat().filter((x: any) => x.severity === 1);
      const button = (program as any).sparkle.layouts.first.children[0].children[0];
      expect(errors).toEqual([]);
      expect(button.classes).toEqual(["wide"]);
      expect(button.content).toEqual([{ kind: "literal", text: "Over" }]);
      expect(formatSource(formatted(d))).toBe(formatted(d));
    }
  });
});

describe("a value nested past one level reads as the same value at depth one", () => {
  test.each(families.map((f) => [f.name, f] as const))("%s", async (_, family) => {
    const [shallowDepth, ...deeper] = family.depths;
    const shallow = await read(family, shallowDepth!);
    expect(shallow.reformatted).toBe(shallow.formatted);
    for (const d of deeper) {
      const deep = await read(family, d);
      expect(collapse(deep.lowered, d), `lowering at depth ${d}`).toBe(shallow.lowered);
      expect(deep.errors, `diagnostics at depth ${d}`).toEqual(shallow.errors);
      expect(deep.top, `declarations at depth ${d}`).toEqual(shallow.top);
      expect(collapse(deep.formatted, d), `formatting at depth ${d}`).toBe(shallow.formatted);
      expect(deep.reformatted, `format idempotence at depth ${d}`).toBe(deep.formatted);
      expect(deep.scopes, `highlighting at depth ${d}`).toEqual(shallow.scopes);
    }
  }, 120_000);
});
