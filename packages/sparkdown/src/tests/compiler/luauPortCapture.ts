// Reads the upstream snippets of the linter and autocomplete ports by running
// the port files, for the Luau corpus gate (#1908).
//
// A port hands a snippet to a harness helper in whatever form the test is
// written: a literal, a `test.each` row, a `for ... of` over an array, a local
// wrapper such as `openMain`, an array joined into a document. Reading the
// files' syntax would miss every form it was not taught, so each file is
// transpiled and run with `vitest` replaced and every other import loaded for
// real: `describe` and `test` run their bodies at once, `expect` passes every
// assertion, and every harness helper records the text it is given and hands
// back what the real helper returns, so a body runs on as it does in its own
// suite. A body in scope that still throws may have stopped before a later
// snippet, so it fails the gate.
//
// What is in scope:
// - linter ports (`../luau-conformance/Lint*.test.ts`): the top-level
//   statements from one whose leading comments mark an upstream case
//   (`// Luau: Name`) up to the next case, or to a statement whose leading
//   comment opens `// Sparkdown`, which is Sparkdown's own.
//   A helper whose name ends in `InFunction` takes a function body; the others
//   (`diagnose`, `diagnoseDetailed`, `diagnoseWithLints`, `lintMessages`) take
//   a document.
// - autocomplete ports (`sparkdown-language-server/src/tests/providers/
//   autocomplete*.test.ts`): the bodies of `upstreamCase` calls whose case is
//   `ported` in `autocompleteUpstreamCases.ts`. `complete` and `labelsAt`
//   take a document.
//
// Every call in scope to a recording helper, or to a local function that calls
// one, is a site. A site that never runs is reported, so a port whose snippet
// the capture cannot reach fails the gate instead of shrinking the corpus.

import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { UPSTREAM_CASES as AUTOCOMPLETE_CASES } from "../../../../sparkdown-language-server/src/tests/providers/autocompleteUpstreamCases";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINT_ROOT = join(__dirname, "..", "luau-conformance");
const AUTOCOMPLETE_ROOT = join(__dirname, "..", "..", "..", "..", "sparkdown-language-server", "src", "tests", "providers");

const LINT_HARNESS = "./diagnosticTestHarness";
const AUTOCOMPLETE_HARNESS = "./completionHarness";
const LINT_DOCUMENT_HELPERS = new Set(["diagnose", "diagnoseDetailed", "diagnoseWithLints", "lintMessages"]);
const AUTOCOMPLETE_HELPERS = new Set(["complete", "labelsAt"]);

export interface CapturedSnippet {
  source: "lint" | "autocomplete";
  /** The port file's name. */
  file: string;
  /** The upstream case: a lint group's `// Luau:` names, or an autocomplete case key. */
  scope: string;
  /** A function body, which the gate places in a function, or a whole document. */
  kind: "body" | "document";
  text: string;
}

export interface PortCapture {
  snippets: CapturedSnippet[];
  /** In-scope sites that never ran, as `file:line`. */
  unreached: string[];
  /** In-scope bodies that threw, and files that did not run, with the error. */
  aborted: string[];
}

interface Context {
  scope: string;
}

/** A value every use accepts: any property, call, `new`, iteration or `await`. */
function anything(): unknown {
  const target = function () {};
  const proxy: unknown = new Proxy(target, {
    get: (_, key) => {
      if (key === Symbol.iterator) return function* () {};
      if (key === Symbol.toPrimitive) return () => "";
      if (key === "then") return undefined;
      return proxy;
    },
    apply: () => proxy,
    construct: () => proxy as object,
  });
  return proxy;
}

interface RunState {
  file: string;
  pending: Promise<unknown>[];
  /** Bodies in scope that threw, which may have stopped before a later snippet. */
  aborted: string[];
  /** Whether the body running now is in scope. */
  inScope: () => boolean;
}

/**
 * Runs a body. One in scope that throws, now or when its promise settles, is
 * recorded as aborted: it may have stopped before handing over a later
 * snippet, as a loop over rows does when a row's result is read.
 */
function settle(body: () => unknown, state: RunState, title: string): void {
  const abort = (error: unknown) => {
    if (!state.inScope()) return;
    state.aborted.push(`${state.file}: ${title}: ${error instanceof Error ? error.message : String(error)}`);
  };
  try {
    const result = body();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      state.pending.push((result as Promise<unknown>).catch(abort));
    }
  } catch (error) {
    abort(error);
  }
}

type Body = (...args: unknown[]) => unknown;

/** `test`, `it` or `describe`: runs the body at once, and the same for `.skip`, `.only`, `.each(rows)` and the like. */
function runner(state: RunState): unknown {
  const run = (name: unknown, body?: Body) => {
    if (typeof body === "function") settle(() => body(), state, String(name));
  };
  return new Proxy(run, {
    get: (_, key) => {
      if (key === "each") {
        return (rows: unknown[]) => (name: unknown, body: Body) => {
          rows.forEach((row, i) => settle(() => body(...(Array.isArray(row) ? row : [row])), state, `${String(name)} [row ${i + 1}]`));
        };
      }
      if (key === "todo") return () => undefined;
      return runner(state);
    },
  });
}

function parse(file: string, text = readFileSync(file, "utf8")): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

/** The names a file imports from `module`, each local name with the name the module exports. */
function importsFrom(source: ts.SourceFile, module: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || (statement.moduleSpecifier as ts.StringLiteral).text !== module) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) names.set(element.name.text, (element.propertyName ?? element.name).text);
  }
  return names;
}

function callsAny(node: ts.Node, names: Set<string>): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** The recording helpers a file imports, and its own top-level functions that call one. */
function siteCallees(source: ts.SourceFile, recording: Set<string>): Set<string> {
  const callees = new Set(recording);
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && callsAny(statement, recording)) callees.add(statement.name.text);
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && callsAny(declaration.initializer, recording)) {
        callees.add(declaration.name.text);
      }
    }
  }
  return callees;
}

interface Edit {
  from: number;
  to: number;
  text: string;
}

function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  // From the end, and at one offset the replacement before the insertion, so
  // every edit's offsets still hold when it is applied.
  for (const edit of [...edits].sort((a, b) => b.from - a.from || b.to - a.to)) {
    out = out.slice(0, edit.from) + edit.text + out.slice(edit.to);
  }
  return out;
}

/** Marks every call to one of `callees` inside `node` as a site. */
function markSites(source: ts.SourceFile, node: ts.Node, callees: Set<string>, sites: string[], edits: Edit[]): void {
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && callees.has(n.expression.text)) {
      const id = sites.length;
      sites.push(`${source.fileName.split(/[\\/]/).pop()}:${source.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      edits.push({ from: n.expression.getStart(), to: n.expression.end, text: `__site(${id}, ${n.expression.text})` });
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
}

const LUAU_CASE = /^\/\/ Luau: (.+)$/gm;
const SPARKDOWN_GROUP = /^\/\/ Sparkdown\b/;

/**
 * The upstream cases each top-level statement of a linter port belongs to.
 * A statement whose leading comments name cases (`// Luau: Name`) starts
 * them, one whose leading comment opens `// Sparkdown` is Sparkdown's own and
 * ends them, and any other statement continues the cases before it, as a
 * second `describe` for the same upstream case does.
 */
function luauCaseGroups(source: ts.SourceFile): Map<ts.Statement, string[]> {
  const groups = new Map<ts.Statement, string[]>();
  let current: string[] = [];
  for (const statement of source.statements) {
    const comments = (ts.getLeadingCommentRanges(source.text, statement.pos) ?? []).map((range) =>
      source.text.slice(range.pos, range.end),
    );
    const cases = comments.flatMap((comment) => [...comment.matchAll(LUAU_CASE)].map((m) => m[1]!.trim()));
    if (cases.length) current = cases;
    else if (comments.length && SPARKDOWN_GROUP.test(comments[0]!)) current = [];
    if (current.length && !ts.isImportDeclaration(statement)) groups.set(statement, current);
  }
  return groups;
}

/** The case key of an `upstreamCase(key, ...)` or `upstreamCase.bug(bug, key, ...)` call. */
function upstreamCaseKey(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  const bug = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "upstreamCase";
  if (!bug && !(ts.isIdentifier(callee) && callee.text === "upstreamCase")) return undefined;
  const key = call.arguments[bug ? 1 : 0];
  return key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) ? key.text : undefined;
}

/** The file a relative import names, as Vite would find it. */
function resolveImport(from: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const base = join(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return base;
}

/** Every module a port imports at run time, loaded for real, except `vitest`. */
async function loadImports(path: string, source: ts.SourceFile): Promise<Map<string, unknown>> {
  const modules = new Map<string, unknown>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    if (specifier === "vitest" || modules.has(specifier)) continue;
    modules.set(specifier, await import(/* @vite-ignore */ resolveImport(path, specifier)));
  }
  return modules;
}

async function runPort(
  path: string,
  text: string,
  harness: string,
  recording: (exported: string) => boolean,
  scopes: (source: ts.SourceFile, callees: Set<string>, sites: string[], edits: Edit[]) => void,
  record: (helper: string, args: unknown[], context: Context | undefined) => void,
  inScope: (context: Context | undefined) => boolean,
  contexts: AsyncLocalStorage<Context>,
  capture: PortCapture,
): Promise<void> {
  const source = parse(path, text);
  const modules = await loadImports(path, source);
  const realHarness = (modules.get(harness) ?? {}) as Record<string, unknown>;
  const recorders = [...importsFrom(source, harness)].filter(([, exported]) => recording(exported)).map(([local]) => local);
  const callees = siteCallees(source, new Set(recorders));
  const sites: string[] = [];
  const edits: Edit[] = [];
  scopes(source, callees, sites, edits);
  // A CommonJS function cannot hold `import.meta`; it gets the file's own.
  const visit = (node: ts.Node): void => {
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      edits.push({ from: node.getStart(), to: node.end, text: "__importMeta" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const reached = new Set<number>();
  const code = ts.transpileModule(applyEdits(source.text, edits), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const aborted: string[] = [];
  const state: RunState = {
    file: path.split(/[\\/]/).pop()!,
    pending: [],
    aborted,
    inScope: () => inScope(contexts.getStore()),
  };
  // The harness, with its recording helpers handing back what the real ones
  // return, so a body runs on as it does in its own suite, and the case
  // registration (`upstreamCase`) running the body in its case's context.
  const harnessModule = new Proxy(realHarness, {
    get: (real, key) => {
      if (typeof key !== "string") return undefined;
      if (key === "upstreamCase") {
        const upstreamCase = (scope: string, title: string, body: Body) =>
          contexts.run({ scope }, () => settle(() => body(), state, `${scope}: ${title}`));
        return Object.assign(upstreamCase, {
          bug: (_bug: unknown, scope: string, title: string, body: Body) => upstreamCase(scope, title, body),
        });
      }
      // Sparkdown's own cases, which the real harness would register as tests here.
      if (key === "sparkdownBug") {
        return (_bugs: unknown, title: string, body: Body) => contexts.run({ scope: "" }, () => settle(() => body(), state, title));
      }
      if (recording(key)) {
        return (...args: unknown[]) => {
          record(key, args, contexts.getStore());
          return (real[key] as Body)(...args);
        };
      }
      return real[key];
    },
  });
  // Assertions pass; `expect(() => labelsAt(source)).not.toThrow()` hands over a function.
  const expect = new Proxy(
    (value: unknown) => {
      if (typeof value === "function") settle(() => (value as Body)(), state, "a function handed to expect");
      return anything();
    },
    { get: () => anything() },
  );
  const vitest = { describe: runner(state), test: runner(state), it: runner(state), expect, vi: anything() };
  const requireStub = (specifier: string) =>
    specifier === "vitest" ? vitest : specifier === harness ? harnessModule : modules.get(specifier);
  const module = { exports: {} };
  const site = (id: number, fn: unknown) => {
    reached.add(id);
    return fn;
  };
  const context = (scope: string, body: () => void) => contexts.run({ scope }, body);
  try {
    new Function("require", "module", "exports", "__site", "__context", "__importMeta", code)(
      requireStub,
      module,
      module.exports,
      site,
      context,
      { url: pathToFileURL(path).href },
    );
  } catch (error) {
    capture.aborted.push(`${state.file}: the file did not run: ${error instanceof Error ? error.message : String(error)}`);
  }
  // A promise can start more work as it settles.
  for (let settled = 0; settled < state.pending.length; ) {
    const batch = state.pending.slice(settled);
    settled = state.pending.length;
    await Promise.all(batch);
  }
  capture.aborted.push(...aborted);
  sites.forEach((where, id) => {
    if (!reached.has(id)) capture.unreached.push(where);
  });
}

/**
 * Runs one linter port, given as its file name in the port directory and its
 * text, and adds what it hands its harness to `capture`.
 */
export async function captureLintPort(
  file: string,
  text: string,
  capture: PortCapture = { snippets: [], unreached: [], aborted: [] },
  contexts = new AsyncLocalStorage<Context>(),
): Promise<PortCapture> {
  await runPort(
    join(LINT_ROOT, file),
    text,
    LINT_HARNESS,
    (exported) => exported.endsWith("InFunction") || LINT_DOCUMENT_HELPERS.has(exported),
    (source, callees, sites, edits) => {
      for (const [statement, cases] of luauCaseGroups(source)) {
        markSites(source, statement, callees, sites, edits);
        if (!ts.isExpressionStatement(statement)) continue;
        edits.push({ from: statement.getStart(), to: statement.getStart(), text: `__context(${JSON.stringify(cases.join(", "))}, () => {\n` });
        edits.push({ from: statement.end, to: statement.end, text: "\n});" });
      }
    },
    (helper, args, context) => {
      if (!context || typeof args[0] !== "string") return;
      const kind = helper.endsWith("InFunction") ? "body" : "document";
      capture.snippets.push({ source: "lint", file, scope: context.scope, kind, text: args[0] });
    },
    (context) => context !== undefined,
    contexts,
    capture,
  );
  return capture;
}

/** Runs every linter and autocomplete port and returns the snippets they hand to their harness. */
export async function capturePortSnippets(): Promise<PortCapture> {
  const capture: PortCapture = { snippets: [], unreached: [], aborted: [] };
  const contexts = new AsyncLocalStorage<Context>();

  const lintFiles = readdirSync(LINT_ROOT).filter((f) => /^Lint.*\.test\.ts$/.test(f)).sort();
  for (const file of lintFiles) {
    await captureLintPort(file, readFileSync(join(LINT_ROOT, file), "utf8"), capture, contexts);
  }

  const autocompleteFiles = readdirSync(AUTOCOMPLETE_ROOT).filter((f) => /^autocomplete.*\.test\.ts$/.test(f)).sort();
  for (const file of autocompleteFiles) {
    const path = join(AUTOCOMPLETE_ROOT, file);
    await runPort(
      path,
      readFileSync(path, "utf8"),
      AUTOCOMPLETE_HARNESS,
      (exported) => AUTOCOMPLETE_HELPERS.has(exported),
      (source, callees, sites, edits) => {
        const visit = (node: ts.Node): void => {
          if (ts.isCallExpression(node)) {
            const key = upstreamCaseKey(node);
            if (key !== undefined && AUTOCOMPLETE_CASES[key]?.status === "ported") {
              markSites(source, node.arguments[node.arguments.length - 1]!, callees, sites, edits);
              return;
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      },
      (_helper, args, context) => {
        if (!context || AUTOCOMPLETE_CASES[context.scope]?.status !== "ported" || typeof args[0] !== "string") return;
        capture.snippets.push({ source: "autocomplete", file, scope: context.scope, kind: "document", text: args[0] });
      },
      (context) => context !== undefined && AUTOCOMPLETE_CASES[context.scope]?.status === "ported",
      contexts,
      capture,
    );
  }
  return capture;
}
