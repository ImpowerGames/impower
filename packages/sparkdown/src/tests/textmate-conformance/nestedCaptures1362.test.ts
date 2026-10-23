// textmate-grammar-tree places each capture from the match's own indices, as
// vscode-textmate does (I-1362): a group nested in another group, a group
// after a nested one, and text between groups land where vscode-textmate
// scopes them. Each grammar here runs through both engines, and the scope
// stack of every character must agree.
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import onig from "vscode-oniguruma";
import vstm from "vscode-textmate";
import { describe, expect, test } from "vitest";

const { OnigScanner, OnigString, loadWASM } = onig;
const { Registry, INITIAL } = vstm;

let wasm: Promise<void> | undefined;

/** Each character's scopes as vscode-textmate tokenizes `line` with `grammar`. */
async function vscodeScopes(grammar: any, line: string): Promise<string[]> {
  wasm ??= loadWASM(readFileSync(createRequire(import.meta.url).resolve("vscode-oniguruma/release/onig.wasm")));
  await wasm;
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new OnigScanner(patterns),
      createOnigString: (s: string) => new OnigString(s),
    }),
    loadGrammar: async () => grammar,
  });
  const loaded = (await registry.loadGrammar(grammar.scopeName))!;
  const scopes: string[] = [];
  for (const token of loaded.tokenizeLine(line, INITIAL).tokens) {
    for (let i = token.startIndex; i < token.endIndex; i++) {
      scopes[i] = token.scopes.join(" ");
    }
  }
  return scopes;
}

/** Each character's scopes as textmate-grammar-tree parses `line` with `grammar`. */
function treeScopes(grammar: any, line: string): string[] {
  const parser = new TextmateGrammarParser(structuredClone(grammar));
  const names = new Map<number, string>();
  for (const node of (parser as any).grammar.nodes) {
    if (node?.props?.name) names.set(node.typeIndex, node.props.name);
  }
  const scopes: string[] = new Array(line.length).fill(grammar.scopeName);
  const walk = (node: any, chain: string) => {
    const name = names.get(node.type.id);
    const own = name ? `${chain} ${name}` : chain;
    for (let i = node.from; i < node.to; i++) scopes[i] = own;
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child, own);
  };
  walk(parser.parse(line).topNode, grammar.scopeName);
  return scopes;
}

const grammarOf = (rule: object, repository: object = {}) => ({
  scopeName: "source.nested",
  patterns: [rule],
  repository,
});

describe("capture positions match vscode-textmate", () => {
  test.each([
    {
      name: "a group nested in a named group",
      grammar: grammarOf({
        name: "rule",
        match: "(a(b)c)(d)",
        captures: { "1": { name: "outer" }, "2": { name: "inner" }, "3": { name: "after" } },
      }),
      line: "abcd",
    },
    {
      name: "a group after a nested group with no capture",
      grammar: grammarOf({
        name: "rule",
        match: "(x(=*)y)(z)",
        captures: { "1": { name: "first" }, "3": { name: "last" } },
      }),
      line: "x==yz",
    },
    {
      name: "text between groups",
      grammar: grammarOf({
        name: "rule",
        match: "(new)\\s+(\\w+)",
        captures: { "1": { name: "keyword" }, "2": { name: "type" } },
      }),
      line: "new   Thing",
    },
    {
      name: "a group repeated through the match",
      grammar: grammarOf({
        name: "rule",
        match: "(?:(a)b)+",
        captures: { "1": { name: "a" } },
      }),
      line: "ababab",
    },
    {
      name: "a level backreference nested in a comment capture",
      grammar: grammarOf(
        {
          name: "rule",
          match: "(--\\[(=*)\\[(?:[^\\]]|\\](?!\\2\\]))*\\]\\2\\])(end)",
          captures: { "1": { name: "comment" }, "3": { name: "keyword" } },
        },
      ),
      line: "--[=========[a]==========]b]=========]end",
    },
    {
      name: "a named level group",
      grammar: grammarOf({
        name: "rule",
        match: "(--\\[(?<level>=*)\\[(?:[^\\]]|\\](?!\\k<level>\\]))*\\]\\k<level>\\])(end)",
        captures: { "1": { name: "comment" }, "3": { name: "keyword" } },
      }),
      line: "--[==[a]=]b]==]end",
    },
    {
      // A rule may give its own flags, `d` among them; the indices regex
      // keeps them as they are.
      name: "a nested group in a rule whose flags hold `d`",
      grammar: grammarOf({
        name: "rule",
        match: "(a())",
        flags: "dmuy",
        captures: { "1": { name: "outer" } },
      }),
      line: "a",
    },
    {
      name: "a group in a lookahead over text the match takes",
      grammar: grammarOf({
        name: "rule",
        match: "(?=(a))a",
        captures: { "1": { name: "first" } },
      }),
      line: "a",
    },
    {
      name: "a group in a lookbehind over text the match takes",
      grammar: grammarOf({
        name: "rule",
        match: "a(?<=(a))",
        captures: { "1": { name: "first" } },
      }),
      line: "a",
    },
    {
      name: "a group after a lookahead group over the same text",
      grammar: grammarOf({
        name: "rule",
        match: "(?=(ab))(a)(b)",
        captures: { "1": { name: "ahead" }, "2": { name: "a" }, "3": { name: "b" } },
      }),
      line: "ab",
    },
    {
      name: "a group nested in a capture read with patterns",
      grammar: grammarOf(
        {
          name: "rule",
          match: "(a(b))(c)",
          captures: {
            "1": { patterns: [{ include: "#ab" }] },
            "2": { name: "ignored" },
            "3": { name: "c" },
          },
        },
        { ab: { match: "ab", name: "pair" } },
      ),
      line: "abc",
    },
    {
      name: "a nested group in an end that reads the begin's group",
      // The block reads its text with a catch-all, since the tree closes a
      // rule that cannot read its text where vscode-textmate skips it.
      grammar: grammarOf(
        {
          name: "block",
          begin: "(\\[)(=*)(\\[)",
          end: "(\\])(\\2)(\\])((?:\\s*(--))?)",
          beginCaptures: { "2": { name: "open.level" } },
          endCaptures: { "2": { name: "close.level" }, "4": { name: "trail" }, "5": { name: "dash" } },
          patterns: [{ include: "#char" }],
        },
        { char: { match: "." } },
      ),
      line: "[==[a]=]b]==] --",
    },
  ])("$name", async ({ grammar, line }) => {
    expect(treeScopes(grammar, line)).toEqual(await vscodeScopes(grammar, line));
  });
});
