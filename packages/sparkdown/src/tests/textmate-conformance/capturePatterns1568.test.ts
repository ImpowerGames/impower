// textmate-grammar-tree tokenizes a capture's patterns as vscode-textmate does
// (I-1568): a rule written inline in a capture's patterns has a node type and
// its scope (I-1565), and the patterns read the line before the capture, so a
// lookbehind, `^` or `\b` sees what vscode-textmate sees (I-1566). Each
// grammar here runs through both engines, and the scope stack of every
// character must agree. Each case also states the scopes vscode-textmate
// gives, so a case whose rule never matches cannot pass unnoticed.
import { describe, expect, test } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const grammarOf = (rule: object, repository: object = {}) => ({
  scopeName: "t",
  patterns: [rule],
  repository,
});

/** `(x)(y)` whose `y` is read by the repository rule `afterX`. */
const afterX = (match: string) =>
  grammarOf(
    {
      match: "(x)(y)",
      captures: { "1": { name: "x" }, "2": { patterns: [{ include: "#afterX" }] } },
    },
    { afterX: { match, name: "after" } },
  );

type Case = { name: string; grammar: object; text: string; expected: string[] };

const agrees = async ({ grammar, text, expected }: Case) => {
  const vscode = await vscodeScopes(grammar, text);
  expect(vscode).toEqual(expected);
  expect(treeScopes(grammar, text)).toEqual(vscode);
};

describe("a capture's inline patterns have node types (I-1565)", () => {
  test.each<Case>([
    {
      name: "an inline rule in a capture's patterns",
      grammar: grammarOf({
        name: "text",
        match: "(ab)",
        captures: { "1": { patterns: [{ match: "ab", name: "a" }] } },
      }),
      text: "ab",
      expected: ["t text a", "t text a"],
    },
    {
      name: "an inline rule in an inline rule's capture",
      grammar: grammarOf({
        name: "text",
        match: "(abc)",
        captures: {
          "1": {
            patterns: [
              {
                match: "(a)(bc)",
                name: "outer",
                captures: { "2": { patterns: [{ match: "c", name: "inner" }] } },
              },
            ],
          },
        },
      }),
      text: "abc",
      expected: ["t text outer", "t text outer", "t text outer inner"],
    },
    {
      name: "an inline rule in a begin/end rule's patterns",
      grammar: grammarOf({
        name: "block",
        begin: "\\[",
        end: "\\]",
        patterns: [{ match: "a", name: "a" }],
      }),
      text: "[a]",
      expected: ["t block", "t block a", "t block"],
    },
    {
      // Resolving every pattern list before the node set is built must not
      // stop a grammar loading over a rule the tree does not support, in a
      // list its input never reaches.
      name: "an unsupported rule in a capture's patterns that nothing reaches",
      grammar: {
        scopeName: "t",
        patterns: [
          { match: "a", name: "a" },
          { match: "(b)", captures: { "1": { patterns: [{ begin: "x", while: "x", patterns: [] }] } } },
        ],
      },
      text: "a",
      expected: ["t a"],
    },
  ])("$name", agrees);
});

describe("a capture's patterns read the line before the capture (I-1566)", () => {
  test.each<Case>([
    {
      name: "a lookbehind sees the text before the capture",
      grammar: afterX("(?<=x)y"),
      text: "xy",
      expected: ["t x", "t after"],
    },
    {
      name: "a negative lookbehind sees the text before the capture",
      grammar: afterX("(?<!x)y"),
      text: "xy",
      expected: ["t x", "t"],
    },
    {
      name: "`^` does not match at the capture's start",
      grammar: afterX("^y"),
      text: "xy",
      expected: ["t x", "t"],
    },
    {
      name: "`\\b` reads the character before the capture",
      grammar: afterX("\\by"),
      text: "xy",
      expected: ["t x", "t"],
    },
    {
      name: "`^` still matches a capture at the line's start",
      grammar: grammarOf(
        { match: "(y)", captures: { "1": { patterns: [{ include: "#atStart" }] } } },
        { atStart: { match: "^y", name: "start" } },
      ),
      text: "y",
      expected: ["t start"],
    },
    {
      name: "`^` reads the capture's own line on a later line",
      grammar: grammarOf(
        {
          match: "(x?)(y)",
          captures: { "1": { name: "x" }, "2": { patterns: [{ include: "#atStart" }] } },
        },
        { atStart: { match: "^y", name: "start" } },
      ),
      text: "xy\ny\nxy",
      expected: ["t x", "t", "", "t start", "", "t x", "t"],
    },
    {
      name: "a lookbehind does not read the line above",
      grammar: grammarOf(
        {
          match: "(y)",
          captures: { "1": { patterns: [{ include: "#afterX" }] } },
        },
        { afterX: { match: "(?<=x\\n?)y", name: "after" } },
      ),
      text: "x\ny",
      expected: ["t", "", "t"],
    },
    {
      name: "a lookahead does not read past the capture",
      grammar: grammarOf(
        {
          match: "(y)(z)",
          captures: { "1": { patterns: [{ include: "#beforeZ" }] }, "2": { name: "z" } },
        },
        { beforeZ: { match: "y(?=z)", name: "before" } },
      ),
      text: "yz",
      expected: ["t", "t z"],
    },
    {
      name: "`$` matches at the capture's end",
      grammar: grammarOf(
        {
          match: "(y)(z)",
          captures: { "1": { patterns: [{ include: "#atEnd" }] }, "2": { name: "z" } },
        },
        { atEnd: { match: "y$", name: "end" } },
      ),
      text: "yz",
      expected: ["t end", "t z"],
    },
    {
      name: "a lookbehind past a character the patterns cannot read",
      grammar: grammarOf(
        {
          match: "x(yz)",
          captures: { "1": { name: "cap", patterns: [{ include: "#afterY" }] } },
        },
        { afterY: { match: "(?<=xy)z", name: "after" } },
      ),
      text: "xyz",
      expected: ["t", "t cap", "t cap after"],
    },
    {
      name: "a capture placed from indices, nested in a group",
      grammar: grammarOf(
        {
          match: "(a(b))c",
          captures: { "2": { patterns: [{ include: "#afterA" }] } },
        },
        { afterA: { match: "(?<=a)b", name: "after" } },
      ),
      text: "abc",
      expected: ["t", "t after", "t"],
    },
    {
      name: "a capture's patterns whose own capture reads further back",
      grammar: grammarOf(
        {
          match: "w(xy)",
          captures: { "1": { patterns: [{ include: "#inner" }] } },
        },
        {
          inner: {
            match: "x(y)",
            name: "inner",
            captures: { "1": { patterns: [{ include: "#afterWX" }] } },
          },
          afterWX: { match: "(?<=wx)y", name: "after" },
        },
      ),
      text: "wxy",
      expected: ["t", "t inner", "t inner after"],
    },
    {
      name: "a begin capture's patterns read the text before the begin",
      grammar: grammarOf(
        {
          name: "block",
          begin: "(?<=x)(y)",
          end: "$",
          beginCaptures: { "1": { patterns: [{ include: "#afterX" }] } },
        },
        { afterX: { match: "(?<=x)y", name: "after" } },
      ),
      text: "xy",
      expected: ["t", "t block after"],
    },
  ])("$name", agrees);
});
