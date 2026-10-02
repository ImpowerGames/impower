// An unquoted struct value ends where a trailing comment begins, and the
// grammar says where that is.
//
// `StylingValue` and `UnquotedStringFieldValue` used to run to the end of the
// line, so a trailing `-- note` or `// note` landed inside the value node and
// each struct lowerer cut it back off with its own regexes. The style lowerer
// and the typed (animation / theme) lowerer cut differently: the typed one knew
// that a `--` right after a number ends the number and that a quoted string
// ends at its closing quote, the style one did not, so `gap = 5-- note` and
// `label = "a -- b" -- note` compiled to `5-- note` and `"a` in a style. Now
// the grammar ends the value before the comment and every lowerer reads the
// value node, so all three bodies read the same text.

import type { SyntaxNode } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseSource } from "./grammarSnapshot";

function compile(source: string): any {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler.compile({ textDocument: { uri } }).program;
}

// Each line, and the value it compiles to in a style body and in a typed
// (animation or theme) body. A style keeps numbers as their CSS text.
const LINES: { line: string; key: string; style: unknown; typed: unknown }[] = [
  { line: "delay = 5 -- note", key: "delay", style: "5", typed: 5 },
  { line: "gap = 5-- note", key: "gap", style: "5", typed: 5 },
  { line: "fill = true -- note", key: "fill", style: true, typed: true },
  { line: "size = 5px -- note", key: "size", style: "5px", typed: "5px" },
  { line: "color = red // note", key: "color", style: "red", typed: "red" },
  { line: "tint = red -- a // b", key: "tint", style: "red", typed: "red" },
  { line: "url = http://x.y/z", key: "url", style: "http://x.y/z", typed: "http://x.y/z" },
  { line: "prop = var(--x)", key: "prop", style: "var(--x)", typed: "var(--x)" },
  { line: "spaced = var(--x) -- note", key: "spaced", style: "var(--x)", typed: "var(--x)" },
  { line: "slash = red //note", key: "slash", style: "red //note", typed: "red //note" },
  { line: 'name = "a -- b"', key: "name", style: "a -- b", typed: "a -- b" },
  { line: 'label = "a -- b" -- note', key: "label", style: "a -- b", typed: "a -- b" },
  { line: "count = 5 // note", key: "count", style: "5", typed: 5 },
  { line: "tight = 5//note", key: "tight", style: "5", typed: 5 },
  // A quoted run inside a longer value is read whole, so a marker in it is
  // not a comment.
  { line: 'font = "a -- b", serif -- note', key: "font", style: '"a -- b", serif', typed: '"a -- b", serif' },
  { line: 'family = "a // b", serif // note', key: "family", style: '"a // b", serif', typed: '"a // b", serif' },
];

const body = (indent: string) =>
  LINES.map(({ line }) => `${indent}${line}\n`).join("");

describe("a trailing comment ends an unquoted struct value", () => {
  const program = compile(
    `style card with\n${body("  ")}end\n` +
      `animation slide with\n${body("  ")}end\n` +
      `theme dusk with\n${body("  ")}end\n`,
  );
  const bodies = {
    style: program.styles?.["card"],
    animation: program.context?.animation?.slide,
    theme: program.context?.theme?.dusk,
  };
  for (const { line, key, style, typed } of LINES) {
    for (const [kind, compiled] of Object.entries(bodies)) {
      test(`${kind}: ${line}`, () => {
        expect(compiled?.[key]).toStrictEqual(kind === "style" ? style : typed);
      });
    }
  }

  // A brace block hands its value to the same value rules.
  test("a block property reads the same value", () => {
    const blocks = compile(
      `animation pulse with\n` +
        `  keyframes {\n` +
        `    { offset = 0; color = red -- note\n` +
        `    }\n` +
        `    { offset = 1; gap = 5-- note\n` +
        `    }\n` +
        `  }\n` +
        `end\n`,
    ).context?.animation?.pulse?.keyframes;
    expect(blocks?.[0]?.color).toBe("red");
    expect(blocks?.[1]?.gap).toBe(5);
  });
});

// Every node from `node` down, in document order.
function* walk(node: SyntaxNode): Generator<SyntaxNode> {
  yield node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    yield* walk(child);
  }
}

const VALUE_NODES = new Set([
  "StylingValueContent",
  "NumericFieldValue",
  "BooleanFieldValue",
  "StringFieldValue",
]);

describe("the value node stops before the comment", () => {
  for (const [line, value] of [
    ["delay = 5 -- note", "5"],
    ["gap = 5-- note", "5"],
    ["fill = true -- note", "true"],
    ["color = red -- note", "red"],
    ['label = "a -- b" -- note', '"a -- b"'],
    ['font = "a -- b", serif -- note', '"a -- b", serif'],
    ["count = 5 // note", "5"],
    ["color = red // note", "red"],
  ] as const) {
    test(line, () => {
      const source = `style card with\n  ${line}\nend\n`;
      const nodes = [...walk(parseSource(source).topNode)];
      const valueNode = nodes.find((n) => VALUE_NODES.has(n.name));
      const comment = nodes.find(
        (n) =>
          n.name === "LuauLineComment" ||
          n.name === "LuauStructBlockValueComment",
      );
      expect(valueNode && source.slice(valueNode.from, valueNode.to)).toBe(
        value,
      );
      // The comment is the value's sibling, never inside it.
      expect(comment!.from).toBeGreaterThanOrEqual(valueNode!.to);
      expect(source.slice(comment!.from, comment!.to).trim()).toMatch(
        /^(--|\/\/) note$/,
      );
    });
  }
});
