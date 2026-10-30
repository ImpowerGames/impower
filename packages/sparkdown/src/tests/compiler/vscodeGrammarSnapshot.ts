import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import onig from "vscode-oniguruma";
import vstm from "vscode-textmate";

const { OnigScanner, OnigString, loadWASM } = onig;
const { Registry, parseRawGrammar } = vstm;

const __dirname = dirname(fileURLToPath(import.meta.url));

const GRAMMAR_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "language",
  "sparkdown.language-grammar.json",
);

const LUAU_FILE_GRAMMAR_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "language",
  "sparkdown-luau.language-grammar.json",
);

let registry: InstanceType<typeof Registry> | null = null;
let scopeName: string | null = null;
let wasmLoaded: Promise<void> | null = null;

export const LUAU_FILE_SCOPE_NAME: string = JSON.parse(readFileSync(LUAU_FILE_GRAMMAR_PATH, "utf8")).scopeName;

function loadOnig(): Promise<void> {
  if (wasmLoaded) return wasmLoaded;
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("vscode-oniguruma/release/onig.wasm");
  wasmLoaded = loadWASM(readFileSync(wasmPath));
  return wasmLoaded;
}

async function getRegistry(): Promise<{
  registry: InstanceType<typeof Registry>;
  scopeName: string;
}> {
  await loadOnig();
  if (registry && scopeName) return { registry, scopeName };

  const grammarText = readFileSync(GRAMMAR_PATH, "utf8");
  const luauFileGrammarText = readFileSync(LUAU_FILE_GRAMMAR_PATH, "utf8");
  scopeName = JSON.parse(grammarText).scopeName;
  if (!scopeName) {
    throw new Error(`No scopeName in ${GRAMMAR_PATH}`);
  }

  registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns: string[]) => new OnigScanner(patterns),
      createOnigString: (s: string) => new OnigString(s),
    }),
    loadGrammar: async (requested: string) => {
      if (requested === scopeName) {
        return parseRawGrammar(grammarText, GRAMMAR_PATH);
      }
      if (requested === LUAU_FILE_SCOPE_NAME) {
        return parseRawGrammar(luauFileGrammarText, LUAU_FILE_GRAMMAR_PATH);
      }
      return null;
    },
  });
  return { registry, scopeName };
}

export interface VsTokenDump {
  lineNumber: number;
  lineText: string;
  tokens: {
    startIndex: number;
    endIndex: number;
    text: string;
    scopes: string[];
  }[];
}

export async function tokenize(source: string, { luauFile = false }: { luauFile?: boolean } = {}): Promise<VsTokenDump[]> {
  const { registry, scopeName } = await getRegistry();
  const rootScope = luauFile ? LUAU_FILE_SCOPE_NAME : scopeName;
  const grammar = await registry.loadGrammar(rootScope);
  if (!grammar) {
    throw new Error(`Could not load grammar for ${rootScope}`);
  }

  const out: VsTokenDump[] = [];
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  let ruleStack: vstm.StateStack | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const result = grammar.tokenizeLine(line, ruleStack);
    out.push({
      lineNumber: i + 1,
      lineText: line,
      tokens:
        line.length === 0
          ? []
          : result.tokens
              .filter((tok) => tok.endIndex > tok.startIndex)
              .map((tok) => ({
                startIndex: tok.startIndex,
                endIndex: tok.endIndex,
                text: line.slice(tok.startIndex, tok.endIndex),
                scopes: tok.scopes,
              })),
    });
    ruleStack = result.ruleStack;
  }
  return out;
}

interface AbsToken {
  from: number;
  to: number;
  text: string;
  scopes: string[];
}

interface TreeNode {
  name: string;
  from: number;
  to: number;
  text?: string;
  children: TreeNode[];
}

export function formatTokens(dumps: VsTokenDump[]): string {
  const tokens = collectAbsoluteTokens(dumps);
  if (tokens.length === 0) return "(empty)\n";
  const root = buildScopeTree(tokens);
  return renderTree(root) + "\n";
}

function collectAbsoluteTokens(dumps: VsTokenDump[]): AbsToken[] {
  const out: AbsToken[] = [];
  let lineStart = 0;
  for (let i = 0; i < dumps.length; i++) {
    const dump = dumps[i]!;
    for (const tok of dump.tokens) {
      out.push({
        from: lineStart + tok.startIndex,
        to: lineStart + tok.endIndex,
        text: tok.text,
        scopes: tok.scopes,
      });
    }
    const nlAt = lineStart + dump.lineText.length;
    if (i < dumps.length - 1) {
      const rootScope = dump.tokens[0]?.scopes[0] ?? "";
      out.push({
        from: nlAt,
        to: nlAt + 1,
        text: "\n",
        scopes: rootScope ? [rootScope, "Newline"] : ["Newline"],
      });
      lineStart = nlAt + 1;
    } else {
      lineStart = nlAt;
    }
  }
  return out;
}

function buildScopeTree(tokens: AbsToken[]): TreeNode {
  const rootName = tokens[0]?.scopes[0] ?? "(root)";
  const root: TreeNode = {
    name: rootName,
    from: tokens[0]!.from,
    to: tokens[tokens.length - 1]!.to,
    children: [],
  };
  for (const tok of tokens) {
    let parent = root;
    parent.to = Math.max(parent.to, tok.to);
    const inner = tok.scopes.slice(1);
    for (let i = 0; i < inner.length; i++) {
      const name = inner[i]!;
      const isLast = i === inner.length - 1;
      const reuse =
        !isLast &&
        parent.children.length > 0 &&
        parent.children[parent.children.length - 1]!.name === name &&
        parent.children[parent.children.length - 1]!.text === undefined;
      if (reuse) {
        const node = parent.children[parent.children.length - 1]!;
        node.to = Math.max(node.to, tok.to);
        parent = node;
      } else {
        const node: TreeNode = {
          name,
          from: tok.from,
          to: tok.to,
          children: [],
        };
        if (isLast) node.text = tok.text;
        parent.children.push(node);
        parent = node;
      }
    }
    if (inner.length === 0) {
      root.children.push({
        name: tok.scopes[0] ?? "(token)",
        from: tok.from,
        to: tok.to,
        text: tok.text,
        children: [],
      });
    }
  }
  return root;
}

function renderTree(root: TreeNode): string {
  const out: string[] = [];
  const prefixes: string[] = [];

  function describe(node: TreeNode): string {
    const range =
      node.from === node.to
        ? `${node.from}`
        : `[${node.from}..${node.to}]`;
    const head = `${node.name} ${range}`;
    return node.text !== undefined
      ? `${head}: ${JSON.stringify(node.text)}`
      : head;
  }

  function emit(node: TreeNode, isTop: boolean, isLast: boolean) {
    if (isTop) {
      out.push(describe(node));
    } else {
      const prefix = prefixes.join("");
      const connector = isLast ? " └─ " : " ├─ ";
      out.push(prefix + connector + describe(node));
    }
    if (node.children.length === 0) return;
    if (!isTop) prefixes.push(isLast ? "    " : " │  ");
    for (let i = 0; i < node.children.length; i++) {
      emit(node.children[i]!, false, i === node.children.length - 1);
    }
    if (!isTop) prefixes.pop();
  }

  emit(root, true, true);
  return out.join("\n");
}
