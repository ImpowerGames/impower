// Harness for the port of Luau's type-checker tests, which is the
// specification for Sparkdown's type checker (#589). The ported cases live in
// `typecheck/`, one file per upstream file, and `typecheck/README.md` records
// how a case is ported; this file compiles a case's snippets.
//
// `checkLuau` compiles a Luau snippet exactly as written, as a `.luau` file
// loaded with `run` (the compiler wraps its body in a function, the way
// `runConformanceSource` wraps a runtime fixture by hand). The snippet is
// therefore a Luau file in its own right, and a `--!strict`, `--!nonstrict`
// or `--!nocheck` line in it is Luau's own mode directive for that file. It
// then type checks the file as the compiler hands it over, with the globals
// of the upstream fixture the case names.
//
// Sparkdown's grammar recovers from Luau it cannot read by reading the rest
// of the line as narrative text, without a diagnostic, so the parse check
// looks at the syntax tree as well as at what the validator reports.

import type { SyntaxNode, Tree } from "@lezer/common";
import { createHash } from "node:crypto";
import { vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  AstExprCall,
  AstExprGlobal,
  AstExprIndexName,
  AstExprLocal,
  AstStatLocal,
  AstStatLocalFunction,
  visitAst,
  type AstStatBlock,
} from "../../compiler/typecheck/Ast";
import {
  copyErrors,
  errorFields,
  errorToString,
  type LuauTypeError,
} from "../../compiler/typecheck/Error";
import { Frontend } from "../../compiler/typecheck/Frontend";
import {
  checkLuauUnit,
  modeFromName,
  runFileUnit,
} from "../../compiler/typecheck/LuauDocumentChecker";
import type { ModuleResolver } from "../../compiler/typecheck/Module";
import { toString, toStringPack } from "../../compiler/typecheck/ToString";
import {
  fixtureFrontend as freshFixtureFrontend,
  registerHiddenTypes as addHiddenTypes,
} from "./typecheckFixtures";
import { loadOfficialLuau } from "../compiler/officialLuau";
import { decorateSource } from "./typecheckDecoration";
import { queryType } from "./typecheckQueries";
import {
  Type,
  type TypeId,
  type TypePackId,
} from "../../compiler/typecheck/Type";
import type { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import type { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import type { SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
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
  module?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  /** The Luau error kind (`TypeErrorData` in Luau's `Error.h`); `SyntaxError` for a parse error. */
  code: string;
  /** The error's fields, named as its Luau struct names them, with types printed. */
  data?: Record<string, unknown>;
  /** Reprints genuine error type fields with per-field options. */
  fields?(
    options: Record<string, LuauToStringOptions>,
  ): Record<string, unknown>;
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
  maxTableLength?: number;
  maxTypeLength?: number;
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
  | { typeParameter: number }
  | { generic: number }
  | { genericPack: number }
  | { instantiatedTypeParameter: number }
  | { instantiatedTypePackParameter: number };

/**
 * Which type a query is about: a module-level binding (Luau's
 * `requireType`), a type alias in the module's scope (`lookupType`), or the
 * type of the expression at a position (`requireTypeAtPosition`), followed by
 * an optional path into it.
 */
export type TypeSelector = (
  | { type: string }
  | { global: string }
  | { alias: string }
  | { exportedAlias: string }
  | { importedAlias: [moduleAlias: string, name: string] }
  | {
      builtin:
        | "error"
        | "number"
        | "string"
        | "boolean"
        | "nil"
        | "any"
        | "unknown"
        | "never"
        | "function"
        | "table";
    }
  | { overloadAt: [line: number, column: number] }
  | { diagnosticType: [index: number, field: string] }
  | { typeAt: [line: number, column: number] }
  | { expectedTypeAt: [line: number, column: number] }
  /** The module's return pack; a first result path step selects an entry. */
  | { moduleReturn: true }
) & { path?: TypePathStep[]; module?: string; normalized?: true };

export interface PackFacts {
  length: number | undefined;
  tail: boolean | undefined;
  tailKind?: string;
}
export type LocationTuple = [number, number, number, number];

/** A type the checker found. */
export interface CheckedType {
  /** The type printed as Luau's `toString` prints it. */
  print(options?: LuauToStringOptions): string;
  /** The Luau class of the type (`PrimitiveType`, `FunctionType`, ...), after following bound types. */
  kind: string;
  /** Whether this is the same type as another, as comparing Luau `TypeId`s is. */
  is(other: CheckedType): boolean;
  /** Whether this type is a subtype of another, in that direction. */
  subtypeOf(other: CheckedType): boolean;
  /** For a function: the types at the head of its return pack. */
  results?: CheckedType[];
  /** For a type alias: how many type parameters it declares. */
  typeParameterCount?: number;
  /** For a table: how many properties it has. */
  propertyCount?: number;
  arguments?: PackFacts;
  returns?: PackFacts;
  /** Facts after Luau flatten(), including the residual non-concrete tail. */
  flattenedArguments?: PackFacts;
  flattenedReturns?: PackFacts;
  hasSelf?: boolean;
  polarity?: string;
  instantiatedTypeParameterCount?: number;
  instantiatedTypePackParameterCount?: number;
  genericCount?: number;
  genericPackCount?: number;
  name?: string;
  definitionLocation?: LocationTuple;
  propertyNames?: string[];
  propertyLocations?: Record<
    string,
    { location: LocationTuple | null; typeLocation: LocationTuple | null }
  >;
}

export interface LuauCheckResult {
  /**
   * What Sparkdown found wrong with the snippet's syntax: its validator's
   * diagnostics, the syntax errors its type checker reports (a type Luau's
   * parser cannot read), and each place its parser read the snippet as
   * something other than Luau.
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
  /** The source printed with all inferred annotations, as decorateWithTypes does. */
  decoratedSource(): string;
  /** The compiler's own diagnostics for the snippet, including ones it only logs; not asserted. */
  compilerMessages: string[];
  moduleName?: string;
  /** Parse diagnostics of every dependency/definition, in that source's own locations. */
  setupSyntaxDiagnostics?: LuauDiagnostic[];
  scopes?: {
    aliases: Record<string, LocationTuple>;
    imports: Record<string, string>;
    location: LocationTuple;
  }[];
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
  module?: string;
  moduleSources?: Record<string, string>;
  definitions?: string[];
  globals?: Record<string, string>;
  hiddenTypes?: true;
  retainFullTypeGraphs?: false;
  flags?: Record<string, boolean>;
  clearModules?: true;
  /** Explicit intentional fixture sharing; the caller owns its case-local lifetime. */
  session?: LuauCheckSession;
}

export interface LuauCheckSession {
  frontend?: Frontend;
  fixture?: string;
  modules: Map<string, ReturnType<typeof checkLuauUnit>>;
}
export function createLuauCheckSession(): LuauCheckSession {
  return { modules: new Map() };
}

// Test-only parsing of declaration setup. Production loads prepared ASTs and never imports this oracle.
const parseDefinitions = await loadOfficialLuau("typecheck");
const upstreamPin = "7d5f73364fdbbaa984fa545071630eba73cfea98";

/** Fixed settings are accepted only for explicitly audited equivalent code paths. */
export function validateLuauFlags(
  flags: Record<string, boolean> = {},
  roots: AstStatBlock[] = [],
): void {
  const fixed: Record<string, boolean> = {
    DebugLuauForceOldSolver: false, // Frontend.check only invokes the new solver.
    DebugLuauMagicTypes: false, // No internal magic aliases are installed.
    LuauAvoidTrivialPhis: true, // DataFlowGraph.joinScopes skips identical defs.
    LuauStrictVisitInstantiatedType: true, // Generator records failed references; TypeChecker2 visits type arguments and checks them.
    LuauNewTypePathErrorMessages: true, // TypeChecker2.explainReasonings traverses/render paths with metadata and enclosing negation.
    LuauFixSuperNegationTypePaths: true, // Subtyping super-negation branches attach the Negated component at each leaf.
  };
  for (const [name, value] of Object.entries(flags)) {
    if (name === "LuauExportValueSyntax" && value === true) {
      let hasConst = false,
        hasValueExport = false;
      for (const root of roots)
        visitAst(root, {
          visit: (node) => {
            if (node instanceof AstStatLocal) {
              hasConst ||= node.isConst;
              hasValueExport ||=
                node.isExported || node.vars.some((v) => v.isExported);
            } else if (node instanceof AstStatLocalFunction) {
              hasConst ||= node.isConst;
              hasValueExport ||= node.name.isExported;
            }
            return true;
          },
        });
      // Pinned Parser.cpp's true branch reports const-lvalue errors through
      // reportLValueError; readLuauAst does this unconditionally. This bounded
      // equivalence does not authorize or claim value-export syntax support.
      if (hasConst && !hasValueExport) continue;
      throw new NotImplemented(
        `flag ${name}=${value}; only const declarations without value exports have audited equivalent syntax`,
      );
    }
    if (!(name in fixed) || fixed[name] !== value)
      throw new NotImplemented(
        `flag ${name}=${value}; no equivalent configured checker path`,
      );
  }
}

/** Thrown by a type query the harness cannot answer. */
export class NotImplemented extends Error {
  constructor(what: string) {
    super(`not implemented: ${what}`);
    this.name = "NotImplemented";
  }
}

const SNIPPET_NAME = "snippet";
const MAIN_URI = "inmemory:///main.sd";
const SNIPPET_URI = `inmemory:///${SNIPPET_NAME}.luau`;
// The name Luau's test fixture gives the module it checks.
const MAIN_MODULE_NAME = "MainModule";

function compileSource(source: string) {
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
    logged.push(
      args[0] === "HIDDEN" ? String(args[1]) : args.map(String).join(" "),
    );
  });
  let program;
  try {
    program = compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  } finally {
    warn.mockRestore();
  }

  const documents = compiler.documents;
  const wrapped = wrappedSnippet(documents, source);
  // The compiler checks the snippet's types under the file's own URI, in its own lines.
  const syntaxDiagnostics = syntaxDiagnosticsOf(
    wrapped,
    documents,
    program.diagnostics?.[SNIPPET_URI] ?? [],
  );

  const compilerMessages = [...logged];
  for (const d of program.diagnostics?.[wrapped.uri] ?? [])
    compilerMessages.push(diagnosticMessage(d));

  // The checker reads the snippet as the compiler hands it over, with the
  // globals of the upstream fixture the case names.
  const unit = runFileUnit(
    wrapped.uri,
    wrapped.document.getText(),
    wrapped.tree,
  );
  if (!unit)
    throw new Error(`the checker does not read ${wrapped.uri} as a run file`);
  return { unit, syntaxDiagnostics, compilerMessages };
}

export function checkLuau(
  source: string,
  options: CheckLuauOptions = {},
): LuauCheckResult {
  const prepared = compileSource(source);
  validateLuauFlags(options.flags, [prepared.unit.root]);
  const { syntaxDiagnostics, compilerMessages } = prepared;
  const session = options.session ?? createLuauCheckSession();
  const fixture = options.fixture ?? "Fixture";
  if (session.frontend && session.fixture !== fixture)
    throw new Error("shared fixture session cannot change fixture");
  const frontend = session.frontend ?? freshFixtureFrontend(fixture);
  if (!frontend) {
    // Without the fixture's globals nothing is checked: the snippet's parse
    // still counts, and a type query says which fixture is missing.
    const missing = (): never => {
      throw new NotImplemented(`the globals of the fixture ${options.fixture}`);
    };
    return {
      syntaxDiagnostics,
      checked: false,
      diagnostics: syntaxDiagnostics,
      typeOf: missing,
      find: missing,
      decoratedSource: missing,
      compilerMessages,
    };
  }
  session.frontend = frontend;
  session.fixture = fixture;
  if (options.clearModules) session.modules.clear();
  if (options.hiddenTypes) addHiddenTypes(frontend);
  const setupSyntaxDiagnostics: LuauDiagnostic[] = [];
  const definitions = [...(options.definitions ?? [])];
  for (const [name, annotation] of Object.entries(options.globals ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      throw new Error(`invalid typed global name ${JSON.stringify(name)}`);
    definitions.push(`declare ${name}: ${annotation}`);
  }
  definitions.forEach((definition, index) => {
    const parsed = parseDefinitions(definition);
    const module = `@definitions/${index}`;
    for (const diagnostic of parsed.diagnostics)
      setupSyntaxDiagnostics.push({
        module,
        code: "SyntaxError",
        message: diagnostic.message,
        line: diagnostic.location.begin.line,
        column: diagnostic.location.begin.column,
        endLine: diagnostic.location.end.line,
        endColumn: diagnostic.location.end.column,
      });
    if (parsed.errors) return;
    const loaded = frontend.loadDefinitionFile(
      frontend.globals,
      frontend.globals.globalScope,
      {
        version: 1,
        parser: upstreamPin,
        sourceSha256: createHash("sha256").update(definition).digest("hex"),
        root: parsed.root,
      },
      module,
    );
    if (!loaded.success)
      throw new Error(
        `definition ${module} failed: ${loaded.module?.errors.map(errorToString).join("; ")}`,
      );
  });
  const mode = modeFromName(options.mode ?? "strict")!;
  const entry = options.module ?? MAIN_MODULE_NAME;
  if (options.moduleSources && entry in options.moduleSources)
    throw new Error(`entry module ${entry} is duplicated in moduleSources`);
  const sources = new Map<string, ReturnType<typeof compileSource>>([
    [entry, prepared],
  ]);
  for (const [name, text] of Object.entries(options.moduleSources ?? {})) {
    const dependency = compileSource(text);
    validateLuauFlags(options.flags, [
      prepared.unit.root,
      dependency.unit.root,
    ]);
    sources.set(name, dependency);
    setupSyntaxDiagnostics.push(
      ...dependency.syntaxDiagnostics.map((d) => ({ ...d, module: name })),
    );
    compilerMessages.push(...dependency.compilerMessages);
    // A changed source under the same name must never reuse a previous graph.
    session.modules.delete(name);
  }
  session.modules.delete(entry);
  const visiting = new Set<string>();
  const freshlyChecked = new Set<string>();
  const requires = new Map<string, Set<string>>();
  const resolveName = (
    current: string,
    expression: import("../../compiler/typecheck/Ast").AstExpr,
  ): string | undefined => {
    if (expression instanceof AstExprCall) {
      if (expression.args.length !== 1) return undefined;
      return resolveName(current, expression.args[0]!);
    }
    const segments: string[] = [];
    let cursor = expression;
    while (cursor instanceof AstExprIndexName) {
      segments.unshift(cursor.index);
      cursor = cursor.expr;
    }
    if (!segments.length) return undefined;
    if (cursor instanceof AstExprGlobal) segments.unshift(cursor.name);
    else if (cursor instanceof AstExprLocal)
      segments.unshift(cursor.local.name);
    else return undefined;
    const result = segments[0] === "script" ? current.split("/") : [];
    for (const part of segments[0] === "script"
      ? segments.slice(1)
      : segments) {
      if (part === "Parent" && result.length > 1) result.pop();
      else result.push(part);
    }
    return result.join("/");
  };
  const checkModule = (
    name: string,
  ): ReturnType<typeof checkLuauUnit> | undefined => {
    const cached = session.modules.get(name);
    if (cached) return cached;
    const input = sources.get(name);
    if (!input) return undefined;
    if (visiting.has(name))
      throw new NotImplemented(`cyclic named module graph involving ${name}`);
    visiting.add(name);
    try {
      const result = checkLuauUnit(frontend, name, input.unit, mode);
      session.modules.set(name, result);
      freshlyChecked.add(name);
      return result;
    } finally {
      visiting.delete(name);
    }
  };
  const resolver: ModuleResolver = {
    resolveModuleInfo: (current, expr) => {
      const name = resolveName(current, expr);
      if (name) {
        const edges = requires.get(current) ?? new Set<string>();
        edges.add(name);
        requires.set(current, edges);
      }
      return name ? { name, optional: false } : undefined;
    },
    getModule: (name) => checkModule(name)?.module,
    moduleExists: (name) => sources.has(name),
    getHumanReadableModuleName: (name) => name.replaceAll("/", "."),
  };
  frontend.moduleResolver = resolver;
  const checked = checkModule(entry)!;
  // Fixture::check dirties the entry. Pinned Frontend::parseGraph uses LIFO
  // dependency postorder; check appends only freshly checked module errors,
  // without cached getCheckResult's source sorting.
  const allErrors: LuauTypeError[] = [];
  const reachable: ReturnType<typeof checkLuauUnit>[] = [];
  const seen = new Set<string>();
  const collect = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const dependency of [...(requires.get(name) ?? [])].reverse())
      collect(dependency);
    const result = session.modules.get(name);
    if (!result) return;
    reachable.push(result);
    if (freshlyChecked.has(name))
      allErrors.push(...result.sourceModule.parseErrors, ...result.module.errors);
  };
  collect(entry);
  if (options.retainFullTypeGraphs === false) {
    for (const checked of reachable) {
      copyErrors(
        checked.module.errors,
        checked.module.interfaceTypes,
        frontend.builtinTypes,
      );
      checked.module.internalTypes.types.length = 0;
      checked.module.internalTypes.typePacks.length = 0;
      for (const map of [
        checked.module.astTypes,
        checked.module.astTypePacks,
        checked.module.astExpectedTypes,
        checked.module.astOriginalCallTypes,
        checked.module.astOverloadResolvedTypes,
        checked.module.astForInNextTypes,
        checked.module.astResolvedTypes,
        checked.module.astResolvedTypePacks,
        checked.module.astCompoundAssignResultTypes,
        checked.module.upperBoundContributors,
        checked.module.astScopes,
      ])
        map.clear();
      checked.module.scopes.length = 0;
      checked.module.astTypeReferenceLookupFailures.clear();
      checked.module.astTypePackReferenceLookupFailures.clear();
    }
  }
  const diagnostics = allErrors.map(toLuauDiagnostic);

  const find = (selector: TypeSelector): CheckedType => {
    if (
      options.retainFullTypeGraphs === false &&
      !(
        "moduleReturn" in selector ||
        "exportedAlias" in selector ||
        "diagnosticType" in selector ||
        "builtin" in selector
      )
    )
      throw new Error(
        "type query unavailable: retainFullTypeGraphs=false discarded internal graphs",
      );
    const selected = selector.module ? checkModule(selector.module) : checked;
    if (!selected) throw new Error(`no checked module ${selector.module}`);
    const ty = queryType(
      frontend,
      selected.module,
      selected.sourceModule,
      selector,
      selector.module ? undefined : allErrors,
    );
    if (!ty) throw new Error(`no type for ${JSON.stringify(selector)}`);
    return ty;
  };
  return {
    syntaxDiagnostics,
    checked: true,
    diagnostics,
    typeOf: (name, options) => find({ type: name }).print(options),
    find,
    decoratedSource: () => {
      if (options.retainFullTypeGraphs === false)
        throw new Error("decoration unavailable: internal graphs discarded");
      return decorateSource(source, checked.module, checked.sourceModule);
    },
    compilerMessages,
    moduleName: entry,
    setupSyntaxDiagnostics,
    scopes: checked.module.scopes.map(([location, scope]) => ({
      location: locationTuple(location),
      imports: Object.fromEntries(scope.importedModules),
      aliases: Object.fromEntries(
        [...scope.typeAliasNameLocations].map(([name, loc]) => [
          name,
          locationTuple(loc),
        ]),
      ),
    })),
  };
}

function toLuauDiagnostic(error: LuauTypeError): LuauDiagnostic {
  return {
    module: error.moduleName,
    line: error.location.begin.line,
    column: error.location.begin.column,
    endLine: error.location.end.line,
    endColumn: error.location.end.column,
    message: errorToString(error),
    code: error.data.kind,
    data: errorFields(error),
    fields: (options) => {
      const fields = errorFields(error);
      for (const [name, printing] of Object.entries(options)) {
        const value = (error.data as unknown as Record<string, unknown>)[name];
        if (value && typeof value === "object" && "ty" in value) {
          fields[name] =
            value instanceof Type
              ? toString(value as TypeId, printing)
              : toStringPack(value as TypePackId, printing);
        } else
          throw new Error(
            `diagnostic field ${name} is not a type or type pack`,
          );
      }
      return fields;
    },
  };
}

function locationTuple(
  location: import("../../compiler/typecheck/Location").Location,
): LocationTuple {
  return [
    location.begin.line,
    location.begin.column,
    location.end.line,
    location.end.column,
  ];
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
function wrappedSnippet(
  documents: SparkdownDocumentRegistry,
  source: string,
): WrappedSnippet {
  const uris = [...documents.keys()].filter((uri) =>
    uri.startsWith(`${SNIPPET_URI}?run=`),
  );
  if (uris.length !== 1) {
    throw new Error(
      `expected one document for the snippet run by main.sd, found ${JSON.stringify(uris)}`,
    );
  }
  const uri = uris[0]!;
  const document = documents.get(uri);
  const tree = documents.tree(uri);
  if (!document || !tree) throw new Error(`no parsed document for ${uri}`);
  const text = document.getText();
  const wrapper = uri.slice(uri.indexOf("?run=") + "?run=".length);
  const prefix = `& ${wrapper}()\nfunction ${wrapper}()\n`;
  const suffix = "\nend\n";
  if (
    !text.startsWith(prefix) ||
    !text.endsWith(suffix) ||
    text.slice(prefix.length, text.length - suffix.length) !== source
  ) {
    throw new Error(
      `run no longer wraps a file as the harness expects: ${JSON.stringify(text.slice(0, 120))}`,
    );
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
    LuauDoubleQuotedStringInterpolation:
      "an interpolation, where Luau reads string text",
    LuauDoubleQuotedFunctionCallShorthand:
      "a function call, where Luau reads string text",
    LuauBacktickFunctionCallShorthand:
      "a function call, where Luau rejects double braces in an interpolated string",
  } satisfies Partial<Record<SparkdownNodeName, string>>),
);

function syntaxDiagnosticsOf(
  wrapped: WrappedSnippet,
  documents: SparkdownDocumentRegistry,
  compilerDiagnostics: readonly SparkDiagnostic[],
): LuauDiagnostic[] {
  const found: LuauDiagnostic[] = [];
  const text = wrapped.document.getText();
  const snippetEnd = wrapped.offset + wrapped.length;
  const report = (from: number, to: number, message: string) => {
    const begin = snippetPosition(
      wrapped,
      Math.min(Math.max(from, wrapped.offset), snippetEnd),
    );
    const end = snippetPosition(
      wrapped,
      Math.min(Math.max(to, wrapped.offset), snippetEnd),
    );
    found.push({
      ...begin,
      endLine: end.line,
      endColumn: end.column,
      message,
      code: "SyntaxError",
    });
  };
  const quote = (from: number, to: number) => {
    const line = text.slice(from, to).split("\n")[0]!.trim();
    if (!line) return "the end of the snippet";
    return JSON.stringify(line.length > 60 ? `${line.slice(0, 60)}...` : line);
  };

  documents
    .annotations(wrapped.uri)
    .validations.between(wrapped.offset, snippetEnd, (from, to, value) => {
      if (value.type.message) report(from, to, value.type.message);
    });
  for (const d of compilerDiagnostics) {
    if (d.code !== "SyntaxError" || !d.range) continue;
    const { start, end } = d.range;
    found.push({
      line: start.line,
      column: start.character,
      endLine: end.line,
      endColumn: end.character,
      message: diagnosticMessage(d),
      code: "SyntaxError",
    });
  }

  const top: SyntaxNode[] = [];
  for (
    let node = wrapped.tree.topNode.firstChild;
    node;
    node = node.nextSibling
  )
    top.push(node);
  const fn = top.find((node) => node.name === "LuauFunctionDefinition");
  if (!fn) {
    report(
      wrapped.offset,
      snippetEnd,
      "Sparkdown did not read the snippet as the body of the function run wraps it in",
    );
    return found;
  }
  // The wrapper must end at its own `end`, after the whole snippet.
  if (fn.to !== text.length - "\n".length) {
    const stray = top.find(
      (node) => node.from >= fn.to && !NEUTRAL_NODES.has(node.name),
    );
    const at = stray?.from ?? fn.to;
    report(
      at,
      snippetEnd,
      `Sparkdown ended the snippet's function before ${quote(at, snippetEnd)}`,
    );
  }

  const visit = (node: SyntaxNode) => {
    if (node.type.isError) {
      report(
        node.from,
        Math.max(node.to, node.from + 1),
        `Sparkdown could not finish reading the Luau before ${quote(node.from, snippetEnd)}`,
      );
      return;
    }
    if (!node.name.startsWith("Luau") && !NEUTRAL_NODES.has(node.name)) {
      report(
        node.from,
        node.to,
        `Sparkdown read ${quote(node.from, node.to)} as ${node.name}, not Luau`,
      );
      return;
    }
    if (TEXT_NODES.test(node.name)) {
      visitInterpolations(node);
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling)
      visit(child);
  };
  // Within text, a backtick string's interpolation is read as Luau, and an
  // expression only Sparkdown reads there, or an unfinished node, is reported.
  const visitInterpolations = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const sparkdownReading = SPARKDOWN_STRING_EXPRESSIONS.get(child.name);
      if (sparkdownReading)
        report(
          child.from,
          child.to,
          `Sparkdown read ${quote(child.from, child.to)} as ${sparkdownReading}`,
        );
      else if (child.type.isError || child.name === LUAU_INTERPOLATION)
        visit(child);
      else visitInterpolations(child);
    }
  };
  for (let child = fn.firstChild; child; child = child.nextSibling)
    visit(child);
  // The parser can leave several unfinished nodes at one place.
  const distinct = new Map(found.map((d) => [describeDiagnostic(d), d]));
  return [...distinct.values()].sort(
    (a, b) => a.line - b.line || a.column - b.column,
  );
}

function snippetPosition(
  wrapped: WrappedSnippet,
  offset: number,
): { line: number; column: number } {
  const position = wrapped.document.positionAt(offset);
  return {
    line: position.line - wrapped.lineOffset,
    column: position.character,
  };
}
