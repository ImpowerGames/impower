
import type { SyntaxNode, Tree } from "@lezer/common";
import { createHash } from "node:crypto";
import { expect, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
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
import { pinnedModuleDependencyOrder } from "./typecheckModuleOrder";
import { traceFixtureRequires } from "./typecheckRequireTrace";
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

export interface LuauDiagnostic {
  module?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  code: string;
  data?: Record<string, unknown>;
  fields?(
    options: Record<string, LuauToStringOptions>,
  ): Record<string, unknown>;
}

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
  | { moduleReturn: true }
) & { path?: TypePathStep[]; module?: string; normalized?: true };

export interface PackFacts {
  length: number | undefined;
  tail: boolean | undefined;
  tailKind?: string;
}
export type LocationTuple = [number, number, number, number];

export interface CheckedType {
  print(options?: LuauToStringOptions): string;
  kind: string;
  is(other: CheckedType): boolean;
  subtypeOf(other: CheckedType): boolean;
  results?: CheckedType[];
  typeParameterCount?: number;
  propertyCount?: number;
  arguments?: PackFacts;
  returns?: PackFacts;
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
  syntaxDiagnostics: LuauDiagnostic[];
  checked: boolean;
  diagnostics: LuauDiagnostic[];
  typeOf(name: string, options?: LuauToStringOptions): string;
  find(selector: TypeSelector): CheckedType;
  decoratedSource(): string;
  compilerMessages: string[];
  moduleName?: string;
  setupSyntaxDiagnostics?: LuauDiagnostic[];
  scopes?: {
    aliases: Record<string, LocationTuple>;
    imports: Record<string, string>;
    location: LocationTuple;
  }[];
}

export interface CheckLuauOptions {
  mode?: LuauMode;
  fixture?: string;
  module?: string;
  moduleSources?: Record<string, string>;
  definitions?: string[];
  globals?: Record<string, string>;
  hiddenTypes?: true;
  retainFullTypeGraphs?: false;
  flags?: Record<string, boolean>;
  clearModules?: true;
  session?: LuauCheckSession;
}

export interface LuauCheckSession {
  frontend?: Frontend;
  fixture?: string;
  modules: Map<string, ReturnType<typeof checkLuauUnit>>;
  sources?: Map<string, ReturnType<typeof compileSource>>;
  traces?: Map<string, ReturnType<typeof traceFixtureRequires>>;
}
export function createLuauCheckSession(): LuauCheckSession {
  return { modules: new Map() };
}

const parseDefinitions = await loadOfficialLuau("typecheck");
const upstreamPin = "7d5f73364fdbbaa984fa545071630eba73cfea98";

export function validateLuauFlags(
  flags: Record<string, boolean> = {},
  roots: AstStatBlock[] = [],
): void {
  const fixed: Record<string, boolean> = {
    DebugLuauForceOldSolver: false,
    DebugLuauMagicTypes: false,
    LuauAvoidTrivialPhis: true,
    LuauStrictVisitInstantiatedType: true,
    LuauNewTypePathErrorMessages: true,
    LuauFixSuperNegationTypePaths: true,
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

export class NotImplemented extends Error {
  constructor(what: string) {
    super(`not implemented: ${what}`);
    this.name = "NotImplemented";
  }
}

const SNIPPET_NAME = "snippet";
const MAIN_URI = "inmemory:///main.sd";
const SNIPPET_URI = `inmemory:///${SNIPPET_NAME}.luau`;
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
        text: `scene start\n  run "${SNIPPET_NAME}"\nend\n`,
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
  const syntaxDiagnostics = syntaxDiagnosticsOf(
    wrapped,
    documents,
    program.diagnostics?.[SNIPPET_URI] ?? [],
  );

  const compilerMessages = [...logged];
  for (const d of program.diagnostics?.[wrapped.uri] ?? [])
    compilerMessages.push(diagnosticMessage(d));

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
  if (options.clearModules) {
    session.modules.clear();
    session.sources?.clear();
    session.traces?.clear();
  }
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
  const suppliedSources = Object.entries(options.moduleSources ?? {});
  if (suppliedSources.some(([name]) => name === entry))
    throw new Error(`entry module ${entry} is duplicated in moduleSources`);
  const sources = (session.sources ??=
    new Map<string, ReturnType<typeof compileSource>>());
  const traces = (session.traces ??=
    new Map<string, ReturnType<typeof traceFixtureRequires>>());
  const markDirty = (name: string) => {
    const pending = [name];
    const dirty = new Set<string>();
    while (pending.length) {
      const next = pending.pop()!;
      if (dirty.has(next)) continue;
      dirty.add(next);
      session.modules.delete(next);
      for (const [importer, trace] of traces)
        if (trace.dependencies.includes(next)) pending.push(importer);
    }
  };
  markDirty(entry);
  sources.set(entry, prepared);
  traces.set(entry, traceFixtureRequires(prepared.unit.root, entry));
  for (const [name, text] of suppliedSources) {
    const dependency = compileSource(text);
    validateLuauFlags(options.flags, [
      prepared.unit.root,
      dependency.unit.root,
    ]);
    markDirty(name);
    sources.set(name, dependency);
    traces.set(name, traceFixtureRequires(dependency.unit.root, name));
    setupSyntaxDiagnostics.push(
      ...dependency.syntaxDiagnostics.map((d) => ({ ...d, module: name })),
    );
    compilerMessages.push(...dependency.compilerMessages);
  }
  const visiting = new Set<string>();
  const freshlyChecked = new Set<string>();
  const requires = new Map(
    [...traces].map(([name, trace]) => [name, new Set(trace.dependencies)]),
  );
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
      for (const dependency of pinnedModuleDependencyOrder(
        requires.get(name) ?? [],
      ).reverse())
        checkModule(dependency);
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
      const name = traces.get(current)?.expressions.get(expr);
      return name !== undefined ? { name, optional: false } : undefined;
    },
    getModule: (name) => checkModule(name)?.module,
    moduleExists: (name) => sources.has(name),
    getHumanReadableModuleName: (name) => name.replaceAll("/", "."),
  };
  frontend.moduleResolver = resolver;
  const checked = checkModule(entry)!;
  const allErrors: LuauTypeError[] = [];
  const reachable: ReturnType<typeof checkLuauUnit>[] = [];
  const seen = new Set<string>();
  const collect = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const dependency of pinnedModuleDependencyOrder(
      requires.get(name) ?? [],
    ).reverse())
      collect(dependency);
    const result = session.modules.get(name);
    if (!result) return;
    reachable.push(result);
    if (freshlyChecked.has(name))
      allErrors.push(
        ...result.sourceModule.parseErrors,
        ...result.module.errors,
      );
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

const MISSING_TYPE_ERROR = /^Expected type, got /;

export function luauSyntaxErrors(diagnostics: readonly LuauDiagnostic[]): string[] {
  return inDiagnosticOrder(
    diagnostics
      .filter((d) => d.code === "SyntaxError")
      .map((d) => (MISSING_TYPE_ERROR.test(d.message) && (d.endLine > d.line + 1 || (d.endLine === d.line + 1 && d.endColumn > 0)) ? { ...d, endLine: d.line + 1, endColumn: 0 } : d)),
  );
}

export function expectLuauSyntax(source: string, listed: readonly string[]): void {
  const result = checkLuau(source);
  expect(result.syntaxDiagnostics.map(describeDiagnostic)).toEqual(expect.arrayContaining([...listed]));
  expect(inDiagnosticOrder(result.syntaxDiagnostics)).toEqual(luauSyntaxErrors(result.diagnostics));
}

export function inDiagnosticOrder(diagnostics: readonly LuauDiagnostic[]): string[] {
  return [...diagnostics]
    .sort((a, b) => a.line - b.line || a.column - b.column || (describeDiagnostic(a) < describeDiagnostic(b) ? -1 : 1))
    .map(describeDiagnostic);
}

interface WrappedSnippet {
  uri: string;
  document: SparkdownDocument;
  tree: Tree;
  offset: number;
  lineOffset: number;
  length: number;
}

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
  const prefix = `\nfunction ${wrapper}()\n`;
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

const TEXT_NODES = /^Luau\w*(String|Comment)$/;
const LUAU_INTERPOLATION: SparkdownNodeName = "LuauBacktickStringInterpolation";

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
