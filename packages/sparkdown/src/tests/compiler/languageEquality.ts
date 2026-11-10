import {
  createLanguageReader,
  type EmbeddedLanguages,
  type LanguageReader,
} from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { type EngineOptions } from "./scopeEquality";
import { createRegistry, LUAU_FILE_SCOPE_NAME } from "./vscodeGrammarSnapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "vscode-sparkdown",
  "package.json",
);

const CORPUS_DIR = join(__dirname, "__snapshots__", "grammar");

export interface GrammarFixture {
  name: string;
  source: string;
}

export function loadGrammarCorpus(): GrammarFixture[] {
  const fixtures: GrammarFixture[] = [];
  for (const category of readdirSync(CORPUS_DIR)) {
    const categoryDir = join(CORPUS_DIR, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    for (const file of readdirSync(categoryDir)) {
      if (!file.endsWith(".sd")) continue;
      fixtures.push({
        name: `${category}/${file.slice(0, -3)}`,
        source: readFileSync(join(categoryDir, file), "utf8"),
      });
    }
  }
  return fixtures;
}

interface ManifestGrammar {
  language: string;
  scopeName: string;
  embeddedLanguages?: Record<string, string>;
}

const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
  contributes: { languages: { id: string }[]; grammars: ManifestGrammar[] };
};

const SCOPE_NAME: string = (GRAMMAR_DEFINITION as { scopeName: string })
  .scopeName;

const LANGUAGE_IDS = MANIFEST.contributes.languages.map((l) => l.id);

const encodeLanguage = (language: string): number => {
  const index = LANGUAGE_IDS.indexOf(language);
  if (index < 0) throw new Error(`Unknown language ${language}`);
  return index + 1;
};

const decodeLanguage = (id: number): string => {
  const language = LANGUAGE_IDS[id - 1];
  if (language === undefined) throw new Error(`Unknown language id ${id}`);
  return language;
};

export interface DocumentLanguage {
  language: string;
  scopeName: string;
  embeddedLanguages: EmbeddedLanguages;
}

export function documentLanguageOf({
  luauFile = false,
}: EngineOptions = {}): DocumentLanguage {
  const scopeName = luauFile ? LUAU_FILE_SCOPE_NAME : SCOPE_NAME;
  const entry = MANIFEST.contributes.grammars.find(
    (g) => g.scopeName === scopeName,
  );
  if (!entry) throw new Error(`No manifest grammar for ${scopeName}`);
  return {
    language: entry.language,
    scopeName,
    embeddedLanguages: entry.embeddedLanguages ?? {},
  };
}

type Parser = ReturnType<typeof createSparkdownParser>;

const parsers = new Map<boolean, Parser>();
const readers = new WeakMap<Parser, LanguageReader>();

function parserFor(luauFile: boolean): Parser {
  let parser = parsers.get(luauFile);
  if (!parser) {
    parser = createSparkdownParser(
      luauFile ? "inmemory:///language-equality.luau" : undefined,
    );
    parsers.set(luauFile, parser);
  }
  return parser;
}

function readerFor(parser: Parser, luauFile: boolean): LanguageReader {
  let reader = readers.get(parser);
  if (!reader) {
    reader = createLanguageReader(
      parser.grammar,
      documentLanguageOf({ luauFile }).embeddedLanguages,
    );
    readers.set(parser, reader);
  }
  return reader;
}

export function parseFor(source: string, { luauFile = false }: EngineOptions = {}) {
  return parserFor(luauFile).parse(source);
}

export function treeLanguagesPerChar(
  source: string,
  { luauFile = false }: EngineOptions = {},
  parser: Parser = parserFor(luauFile),
): string[] {
  const tree = parser.parse(source);
  const reader = readerFor(parser, luauFile);
  const { language } = documentLanguageOf({ luauFile });
  const perChar: string[] = new Array(source.length);
  for (let i = 0; i < source.length; i++) {
    perChar[i] = reader(tree, i, language);
  }
  return perChar;
}

const grammars = new Map<boolean, Promise<any>>();

function vscodeGrammarFor(luauFile: boolean): Promise<any> {
  let grammar = grammars.get(luauFile);
  if (!grammar) {
    const { language, scopeName, embeddedLanguages } = documentLanguageOf({
      luauFile,
    });
    const encoded: Record<string, number> = {};
    for (const [scope, id] of Object.entries(embeddedLanguages)) {
      encoded[scope] = encodeLanguage(id);
    }
    grammar = createRegistry().then(({ registry }) =>
      registry.loadGrammarWithConfiguration(
        scopeName,
        encodeLanguage(language),
        { embeddedLanguages: encoded },
      ),
    );
    grammars.set(luauFile, grammar);
  }
  return grammar;
}

const LANGUAGE_ID_MASK = 0xff;

export async function vscodeLanguagesPerChar(
  source: string,
  { luauFile = false }: EngineOptions = {},
): Promise<string[]> {
  const grammar = await vscodeGrammarFor(luauFile);
  const perChar: string[] = new Array(source.length);
  const lines = source.split("\n");
  let lineStart = 0;
  let ruleStack: any = null;
  for (const line of lines) {
    const result = grammar.tokenizeLine2(line, ruleStack);
    const tokens: Uint32Array = result.tokens;
    for (let t = 0; t < tokens.length; t += 2) {
      const start = tokens[t]!;
      const end = t + 2 < tokens.length ? tokens[t + 2]! : line.length;
      const language = decodeLanguage(tokens[t + 1]! & LANGUAGE_ID_MASK);
      for (let c = start; c < end; c++) perChar[lineStart + c] = language;
    }
    ruleStack = result.ruleStack;
    lineStart += line.length + 1;
  }
  return perChar;
}

export interface LanguageDivergence {
  offset: number;
  lineCol: string;
  vscode: string;
  tree: string;
}

export async function compareLanguages(
  rawSource: string,
  options: EngineOptions = {},
  treeParser?: Parser,
): Promise<{ source: string; divergences: LanguageDivergence[] }> {
  const source = rawSource.replace(/\r\n?/g, "\n");
  const vscode = await vscodeLanguagesPerChar(source, options);
  const tree = treeLanguagesPerChar(source, options, treeParser);
  const divergences: LanguageDivergence[] = [];
  let line = 1;
  let col = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      col = 0;
      continue;
    }
    if (vscode[i] !== tree[i]) {
      divergences.push({
        offset: i,
        lineCol: `${line}:${col}`,
        vscode: vscode[i]!,
        tree: tree[i]!,
      });
    }
    col++;
  }
  return { source, divergences };
}

export function formatLanguageDivergences(
  source: string,
  divergences: LanguageDivergence[],
): string {
  if (divergences.length === 0) return "(engines agree at every character)";
  const out = [
    `${divergences.length} character(s) where vscode-textmate and the tree reader disagree on the language:`,
  ];
  let i = 0;
  while (i < divergences.length) {
    const start = divergences[i]!;
    let j = i;
    while (
      j + 1 < divergences.length &&
      divergences[j + 1]!.offset === divergences[j]!.offset + 1 &&
      divergences[j + 1]!.vscode === start.vscode &&
      divergences[j + 1]!.tree === start.tree
    ) {
      j++;
    }
    const text = source.slice(start.offset, divergences[j]!.offset + 1);
    out.push(
      `  @ ${start.lineCol} ${JSON.stringify(text)} vscode: ${start.vscode} tree: ${start.tree}`,
    );
    i = j + 1;
  }
  return out.join("\n");
}
