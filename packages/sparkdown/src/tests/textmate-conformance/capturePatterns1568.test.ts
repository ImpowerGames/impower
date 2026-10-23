// textmate-grammar-tree tokenizes a capture's patterns as vscode-textmate does
// (I-1568): a rule written inline in a capture's patterns has a node type and
// its scope (I-1565), and the patterns read the line before the capture, so a
// lookbehind, `^` or `\b` sees what vscode-textmate sees (I-1566). Each
// grammar here runs through both engines, and the scope stack of every
// character must agree.
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

describe("a capture's inline patterns have node types (I-1565)", () => {
  test.each([
    {
      name: "an inline rule in a capture's patterns",
      grammar: grammarOf({
        name: "text",
        match: "(ab)",
        captures: { "1": { patterns: [{ match: "ab", name: "a" }] } },
      }),
      text: "ab",
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
    },
  ])("$name", async ({ grammar, text }) => {
    expect(treeScopes(grammar, text)).toEqual(await vscodeScopes(grammar, text));
  });
});

describe("a capture's patterns read the line before the capture (I-1566)", () => {
  test.each([
    { name: "a lookbehind sees the text before the capture", grammar: afterX("(?<=x)y"), text: "xy" },
    { name: "a negative lookbehind sees the text before the capture", grammar: afterX("(?<!x)y"), text: "xy" },
    { name: "`^` does not match at the capture's start", grammar: afterX("^y"), text: "xy" },
    { name: "`\\b` reads the character before the capture", grammar: afterX("\\by"), text: "xy" },
    { name: "`^` still matches a capture at the line's start", grammar: afterX("^y"), text: "y" },
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
    },
  ])("$name", async ({ grammar, text }) => {
    expect(treeScopes(grammar, text)).toEqual(await vscodeScopes(grammar, text));
  });
});
