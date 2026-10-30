import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import onig from "vscode-oniguruma";
import vstm from "vscode-textmate";

const { OnigScanner, OnigString, loadWASM } = onig;
const { Registry, INITIAL } = vstm;

let wasm: Promise<void> | undefined;

export async function vscodeScopes(grammar: any, text: string): Promise<string[]> {
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
  const scopes: string[] = new Array(text.length).fill("");
  let stack = INITIAL;
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const result = loaded.tokenizeLine(line, stack);
    for (const token of result.tokens) {
      for (let i = token.startIndex; i < Math.min(token.endIndex, line.length); i++) {
        scopes[lineStart + i] = token.scopes.join(" ");
      }
    }
    stack = result.ruleStack;
    lineStart += line.length + 1;
  }
  return scopes;
}

export function treeScopes(grammar: any, text: string): string[] {
  const parser = new TextmateGrammarParser(structuredClone(grammar));
  const names = new Map<number, string>();
  for (const node of (parser as any).grammar.nodes) {
    if (node?.props?.name) names.set(node.typeIndex, node.props.name);
  }
  const scopes: string[] = new Array(text.length).fill(grammar.scopeName);
  const walk = (node: any, chain: string) => {
    const name = names.get(node.type?.id);
    const own = name ? `${chain} ${name}` : chain;
    for (let i = node.from; i < node.to; i++) scopes[i] = own;
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child, own);
  };
  walk(parser.parse(text).topNode, grammar.scopeName);
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") scopes[i] = "";
  }
  return scopes;
}
