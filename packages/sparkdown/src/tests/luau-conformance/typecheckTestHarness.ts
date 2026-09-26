// Harness for the port of Luau's type-checker tests, which is the
// specification for Sparkdown's type checker (#589). The ported cases live in
// `typecheck/`, one file per upstream file, and `typecheck/README.md` records
// how a case is ported; this file compiles a case's snippets.
//
// `checkLuau` compiles a Luau snippet exactly as written, as a `.luau` file
// loaded with `run` (the compiler wraps its body in a function, the way
// `runConformanceSource` wraps a runtime fixture by hand). The snippet is
// therefore a Luau file in its own right, and a `--!strict`, `--!nonstrict`
// or `--!nocheck` line in it is Luau's own mode directive for that file.
//
// Sparkdown's grammar recovers from Luau it cannot read by reading the rest
// of the line as narrative text, without a diagnostic, so the parse check
// looks at the syntax tree as well as at what the validator reports.

import type { SyntaxNode, Tree } from "@lezer/common";
import { vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import type { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import type { SparkdownNodeName } from "../../compiler/types/SparkdownNodeName";
import { nodeNameSet } from "../../compiler/utils/nodeNameSet";
import { diagnosticMessage } from "./diagnosticTestHarness";

export type LuauMode = "strict" | "nonstrict" | "nocheck";

/**
 * A diagnostic about the snippet. Lines and columns count from 0 within the
 * snippet as the test writes it, as Luau's `Location` does, so an upstream
 * location compares directly.
 */
export interface LuauDiagnostic {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  /** The Luau error kind (`TypeErrorData` in Luau's `Error.h`); `SyntaxError` for a parse error. */
  code: string;
  /** The error's fields, named as its Luau struct names them, with types printed. */
  data?: Record<string, unknown>;
}

/** The `ToStringOptions` a type is printed with. */
export interface LuauToStringOptions {
  exhaustive?: boolean;
  useLineBreaks?: boolean;
  functionTypeArguments?: boolean;
  hideTableKind?: boolean;
  hideNamedFunctionTypeParameters?: boolean;
  hideFunctionSelfArgument?: boolean;
  hideTableAliasExpansions?: boolean;
  useQuestionMarks?: boolean;
  ignoreSyntheticName?: boolean;
}

/**
 * A step into a type: a table property's read type, a function's argument or
 * result, a table indexer's key or result, or a type alias's type parameter.
 */
export type TypePathStep =
  | { property: string }
  | { argument: number }
  | { result: number }
  | { indexer: "key" | "result" }
  | { typeParameter: number };

/**
 * Which type a query is about: a module-level binding (Luau's
 * `requireType`), a type alias in the module's scope (`lookupType`), or the
 * type of the expression at a position (`requireTypeAtPosition`), followed by
 * an optional path into it.
 */
export type TypeSelector = (
  | { type: string }
  | { alias: string }
  | { typeAt: [line: number, column: number] }
) & { path?: TypePathStep[] };

/** A type the checker found. */
export interface CheckedType {
  /** The type printed as Luau's `toString` prints it. */
  print(options?: LuauToStringOptions): string;
  /** The Luau class of the type (`PrimitiveType`, `FunctionType`, ...), after following bound types. */
  kind: string;
  /** Whether this is the same type as another, as comparing Luau `TypeId`s is. */
  is(other: CheckedType): boolean;
  /** For a function: the types at the head of its return pack. */
  results?: CheckedType[];
  /** For a type alias: how many type parameters it declares. */
  typeParameterCount?: number;
  /** For a table: how many properties it has. */
  propertyCount?: number;
}

export interface LuauCheckResult {
  /**
   * What Sparkdown found wrong with the snippet's syntax: its validator's
   * diagnostics, and each place its parser read the snippet as something
   * other than Luau.
   */
  syntaxDiagnostics: LuauDiagnostic[];
  /** Whether a type checker ran. */
  checked: boolean;
  /** Every diagnostic for the snippet, syntax and type alike, as Luau's `CheckResult::errors`. */
  diagnostics: LuauDiagnostic[];
  /**
   * The type of a module-level binding, printed as Luau's `toString` prints
   * it: `find({ type: name }).print(options)`.
   */
  typeOf(name: string, options?: LuauToStringOptions): string;
  /** The type a selector names. */
  find(selector: TypeSelector): CheckedType;
  /** The compiler's own diagnostics for the snippet, including ones it only logs; not asserted. */
  compilerMessages: string[];
}

export interface CheckLuauOptions {
  /**
   * The mode a snippet without its own directive is checked in. Luau's test
   * fixture checks in strict mode unless a case asks for another, so that is
   * the default here, although non-strict is Sparkdown's own default.
   */
  mode?: LuauMode;
  /** The upstream fixture, which decides the globals and types in scope. */
  fixture?: string;
}

/** Thrown by every type query until #599 implements the checker. */
export class NotImplemented extends Error {
  constructor(what: string) {
    super(`not implemented: ${what} needs the type checker (#599)`);
    this.name = "NotImplemented";
  }
}

const SNIPPET_NAME = "snippet";
const MAIN_URI = "inmemory:///main.sd";
const SNIPPET_URI = `inmemory:///${SNIPPET_NAME}.luau`;

export function checkLuau(source: string, options: CheckLuauOptions = {}): LuauCheckResult {
  // The checker (#599) reads the mode and the fixture; nothing does yet.
  void options;
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: `run "${SNIPPET_NAME}"\n`,
        version: 1,
        languageId: "sparkdown",
      },
      {
        uri: SNIPPET_URI,
        type: "script",
        name: SNIPPET_NAME,
        ext: "luau",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  // The compiler logs a diagnostic it cannot place instead of reporting it.
  const logged: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    logged.push(args[0] === "HIDDEN" ? String(args[1]) : args.map(String).join(" "));
  });
  let program;
  try {
    program = compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  } finally {
    warn.mockRestore();
  }

  const documents = compiler.documents;
  const wrapped = wrappedSnippet(documents, source);
  const syntaxDiagnostics = syntaxDiagnosticsOf(wrapped, documents);

  const compilerMessages = [...logged];
  for (const d of program.diagnostics?.[wrapped.uri] ?? []) compilerMessages.push(diagnosticMessage(d));

  const find = (selector: TypeSelector): CheckedType => {
    throw new NotImplemented(`the type of ${JSON.stringify(selector)}`);
  };
  return {
    syntaxDiagnostics,
    checked: false,
    diagnostics: syntaxDiagnostics,
    typeOf: (name, options) => find({ type: name }).print(options),
    find,
    compilerMessages,
  };
}

export function describeDiagnostic(d: LuauDiagnostic): string {
  return `${d.line}:${d.column}-${d.endLine}:${d.endColumn} ${d.code}: ${d.message}`;
}

// ---------------------------------------------------------------------------
// Reading the snippet back out of the compiler
// ---------------------------------------------------------------------------

interface WrappedSnippet {
  uri: string;
  document: SparkdownDocument;
  tree: Tree;
  /** Where the snippet starts in the wrapped document, and how many lines precede it. */
  offset: number;
  lineOffset: number;
  length: number;
}

// `run` compiles the file as `& <wrapper>()`, then `function <wrapper>()`,
// the file's text, and `end`, in a document of its own. Find that document
// and check the snippet sits in it unchanged, so that a change to how `run`
// wraps a file fails here rather than skewing every position.
function wrappedSnippet(documents: SparkdownDocumentRegistry, source: string): WrappedSnippet {
  const uris = [...documents.keys()].filter((uri) => uri.startsWith(`${SNIPPET_URI}?run=`));
  if (uris.length !== 1) {
    throw new Error(`expected one document for the snippet run by main.sd, found ${JSON.stringify(uris)}`);
  }
  const uri = uris[0]!;
  const document = documents.get(uri);
  const tree = documents.tree(uri);
  if (!document || !tree) throw new Error(`no parsed document for ${uri}`);
  const text = document.getText();
  const wrapper = uri.slice(uri.indexOf("?run=") + "?run=".length);
  const prefix = `& ${wrapper}()\nfunction ${wrapper}()\n`;
  const suffix = "\nend\n";
  if (!text.startsWith(prefix) || !text.endsWith(suffix) || text.slice(prefix.length, text.length - suffix.length) !== source) {
    throw new Error(`run no longer wraps a file as the harness expects: ${JSON.stringify(text.slice(0, 120))}`);
  }
  return {
    uri,
    document,
    tree,
    offset: prefix.length,
    lineOffset: prefix.split("\n").length - 1,
    length: source.length,
  };
}

// Trivia and punctuation that may sit anywhere inside Luau code.
const NEUTRAL_NODES = nodeNameSet([
  "Newline",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "ExtraWhitespace",
  "Whitespace",
  "PunctuationParenOpen",
  "PunctuationParenClose",
  "PunctuationBraceOpen",
  "PunctuationBraceClose",
  "PunctuationBracketOpen",
  "PunctuationBracketClose",
  "PunctuationAngleOpen",
  "PunctuationAngleClose",
  "PunctuationDoubleAngleOpen",
  "PunctuationDoubleAngleClose",
  "PunctuationStringDoubleQuoteOpen",
  "PunctuationStringDoubleQuoteClose",
  "PunctuationStringSingleQuoteOpen",
  "PunctuationStringSingleQuoteClose",
]);

// A string's or comment's contents are text, whatever the grammar calls them,
// except the Luau inside a backtick string's braces.
const TEXT_NODES = /^Luau\w*(String|Comment)$/;
const LUAU_INTERPOLATION: SparkdownNodeName = "LuauBacktickStringInterpolation";

// Braces in a string that Sparkdown reads as an expression and Luau does not
// (DIVERGENCES.md): interpolation in a double-quoted string, and the
// `{{name}}` call shorthand in either kind of string. Each names how the two
// read them.
const SPARKDOWN_STRING_EXPRESSIONS = new Map<string, string>(
  Object.entries({
    LuauDoubleQuotedStringInterpolation: "an interpolation, where Luau reads string text",
    LuauDoubleQuotedFunctionCallShorthand: "a function call, where Luau reads string text",
    LuauBacktickFunctionCallShorthand: "a function call, where Luau rejects double braces in an interpolated string",
  } satisfies Partial<Record<SparkdownNodeName, string>>),
);

function syntaxDiagnosticsOf(wrapped: WrappedSnippet, documents: SparkdownDocumentRegistry): LuauDiagnostic[] {
  const found: LuauDiagnostic[] = [];
  const text = wrapped.document.getText();
  const snippetEnd = wrapped.offset + wrapped.length;
  const report = (from: number, to: number, message: string) => {
    const begin = snippetPosition(wrapped, Math.min(Math.max(from, wrapped.offset), snippetEnd));
    const end = snippetPosition(wrapped, Math.min(Math.max(to, wrapped.offset), snippetEnd));
    found.push({ ...begin, endLine: end.line, endColumn: end.column, message, code: "SyntaxError" });
  };
  const quote = (from: number, to: number) => {
    const line = text.slice(from, to).split("\n")[0]!.trim();
    if (!line) return "the end of the snippet";
    return JSON.stringify(line.length > 60 ? `${line.slice(0, 60)}...` : line);
  };

  documents.annotations(wrapped.uri).validations.between(wrapped.offset, snippetEnd, (from, to, value) => {
    if (value.type.message) report(from, to, value.type.message);
  });

  const top: SyntaxNode[] = [];
  for (let node = wrapped.tree.topNode.firstChild; node; node = node.nextSibling) top.push(node);
  const fn = top.find((node) => node.name === "LuauFunctionDefinition");
  if (!fn) {
    report(wrapped.offset, snippetEnd, "Sparkdown did not read the snippet as the body of the function run wraps it in");
    return found;
  }
  // The wrapper must end at its own `end`, after the whole snippet.
  if (fn.to !== text.length - "\n".length) {
    const stray = top.find((node) => node.from >= fn.to && !NEUTRAL_NODES.has(node.name));
    const at = stray?.from ?? fn.to;
    report(at, snippetEnd, `Sparkdown ended the snippet's function before ${quote(at, snippetEnd)}`);
  }

  const visit = (node: SyntaxNode) => {
    if (node.type.isError) {
      report(node.from, Math.max(node.to, node.from + 1), `Sparkdown could not finish reading the Luau before ${quote(node.from, snippetEnd)}`);
      return;
    }
    if (!node.name.startsWith("Luau") && !NEUTRAL_NODES.has(node.name)) {
      report(node.from, node.to, `Sparkdown read ${quote(node.from, node.to)} as ${node.name}, not Luau`);
      return;
    }
    if (TEXT_NODES.test(node.name)) {
      visitInterpolations(node);
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  };
  // Within text, a backtick string's interpolation is read as Luau, and an
  // expression only Sparkdown reads there, or an unfinished node, is reported.
  const visitInterpolations = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const sparkdownReading = SPARKDOWN_STRING_EXPRESSIONS.get(child.name);
      if (sparkdownReading) report(child.from, child.to, `Sparkdown read ${quote(child.from, child.to)} as ${sparkdownReading}`);
      else if (child.type.isError || child.name === LUAU_INTERPOLATION) visit(child);
      else visitInterpolations(child);
    }
  };
  for (let child = fn.firstChild; child; child = child.nextSibling) visit(child);
  // The parser can leave several unfinished nodes at one place.
  const distinct = new Map(found.map((d) => [describeDiagnostic(d), d]));
  return [...distinct.values()].sort((a, b) => a.line - b.line || a.column - b.column);
}

function snippetPosition(wrapped: WrappedSnippet, offset: number): { line: number; column: number } {
  const position = wrapped.document.positionAt(offset);
  return { line: position.line - wrapped.lineOffset, column: position.character };
}
