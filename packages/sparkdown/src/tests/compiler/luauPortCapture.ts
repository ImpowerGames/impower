// Reads the upstream snippets of the linter and autocomplete ports by running
// the port files, for the Luau corpus gate (#1908).
//
// A port hands a snippet to a harness helper in whatever form the test is
// written: a literal, a `test.each` row, a `for ... of` over an array, a local
// wrapper such as `openMain`, an array joined into a document. Reading the
// files' syntax would miss every form it was not taught, so each file is
// transpiled and run with `vitest` and its harness module replaced: `describe`
// and `test` run their bodies at once, `expect` accepts anything, and every
// harness helper records the text it is given and returns a value that any
// further use accepts. A body that still throws stops there; what it handed
// over first is kept.
//
// What is in scope:
// - linter ports (`../luau-conformance/Lint*.test.ts`): the top-level
//   statements from one whose leading comments mark an upstream case
//   (`// Luau: Name`) up to the next case, or to a statement whose leading
//   comment opens `// Sparkdown`, which is Sparkdown's own.
//   A helper whose name ends in `InFunction` takes a function body; the others
//   (`diagnose`, `diagnoseDetailed`, `diagnoseWithLints`) take a document.
// - autocomplete ports (`sparkdown-language-server/src/tests/providers/
//   autocomplete*.test.ts`): the bodies of `upstreamCase` calls whose case is
//   `ported` in `autocompleteUpstreamCases.ts`. `complete` and `labelsAt`
//   take a document.
//
// Every call in scope to a recording helper, or to a local function that calls
// one, is a site. A site that never runs is reported, so a port whose snippet
// the capture cannot reach fails the gate instead of shrinking the corpus.

import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { UPSTREAM_CASES as AUTOCOMPLETE_CASES } from "../../../../sparkdown-language-server/src/tests/providers/autocompleteUpstreamCases";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINT_ROOT = join(__dirname, "..", "luau-conformance");
const AUTOCOMPLETE_ROOT = join(__dirname, "..", "..", "..", "..", "sparkdown-language-server", "src", "tests", "providers");

const LINT_HARNESS = "./diagnosticTestHarness";
const AUTOCOMPLETE_HARNESS = "./completionHarness";
const LINT_DOCUMENT_HELPERS = new Set(["diagnose", "diagnoseDetailed", "diagnoseWithLints"]);
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

/** Runs a test body, keeping what it records even when it throws. */
function settle(body: () => unknown, pending: Promise<unknown>[]): void {
  try {
    const result = body();
    if (result && typeof (result as Promise<unknown>).then === "function") {
      pending.push((result as Promise<unknown>).catch(() => undefined));
    }
  } catch {
    // The stubs cannot satisfy every assertion; the snippet is already recorded.
  }
}

type Body = (...args: unknown[]) => unknown;

/** `test`, `it` or `describe`: runs the body at once, and the same for `.skip`, `.only`, `.each(rows)` and the like. */
function runner(pending: Promise<unknown>[]): unknown {
  const run = (_name: unknown, body?: Body) => {
    if (typeof body === "function") settle(() => body(), pending);
  };
  return new Proxy(run, {
    get: (_, key) => {
      if (key === "each") {
        return (rows: unknown[]) => (_name: unknown, body: Body) => {
          for (const row of rows) settle(() => body(...(Array.isArray(row) ? row : [row])), pending);
        };
      }
      if (key === "todo") return () => undefined;
      return runner(pending);
    },
  });
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
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

async function runPort(
  path: string,
  harness: string,
  recording: (exported: string) => boolean,
  scopes: (source: ts.SourceFile, callees: Set<string>, sites: string[], edits: Edit[]) => void,
  record: (helper: string, args: unknown[], context: Context | undefined) => void,
  contexts: AsyncLocalStorage<Context>,
  unreached: string[],
): Promise<void> {
  const source = parse(path);
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

  const pending: Promise<unknown>[] = [];
  const harnessModule = new Proxy({} as Record<string, unknown>, {
    get: (_, key) => {
      if (typeof key !== "string") return undefined;
      if (key === "upstreamCase") {
        const upstreamCase = (scope: string, _title: string, body: Body) =>
          contexts.run({ scope }, () => settle(() => body(), pending));
        return Object.assign(upstreamCase, {
          bug: (_bug: unknown, scope: string, title: string, body: Body) => upstreamCase(scope, title, body),
        });
      }
      if (recording(key)) {
        return (...args: unknown[]) => {
          record(key, args, contexts.getStore());
          return anything();
        };
      }
      return anything();
    },
  });
  // `expect(() => labelsAt(source)).not.toThrow()` hands over a function.
  const expect = new Proxy(
    (value: unknown) => {
      if (typeof value === "function") settle(() => (value as Body)(), pending);
      return anything();
    },
    { get: () => anything() },
  );
  const vitest = { describe: runner(pending), test: runner(pending), it: runner(pending), expect, vi: anything() };
  const requireStub = (specifier: string) => (specifier === "vitest" ? vitest : specifier === harness ? harnessModule : anything());
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
  } catch {
    // A file that cannot run leaves its sites unreached, which the gate reports.
  }
  await Promise.all(pending);
  sites.forEach((where, id) => {
    if (!reached.has(id)) unreached.push(where);
  });
}

/** Runs every linter and autocomplete port and returns the snippets they hand to their harness. */
export async function capturePortSnippets(): Promise<PortCapture> {
  const snippets: CapturedSnippet[] = [];
  const unreached: string[] = [];
  const contexts = new AsyncLocalStorage<Context>();

  const lintFiles = readdirSync(LINT_ROOT).filter((f) => /^Lint.*\.test\.ts$/.test(f)).sort();
  for (const file of lintFiles) {
    await runPort(
      join(LINT_ROOT, file),
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
        snippets.push({ source: "lint", file, scope: context.scope, kind: helper.endsWith("InFunction") ? "body" : "document", text: args[0] });
      },
      contexts,
      unreached,
    );
  }

  const autocompleteFiles = readdirSync(AUTOCOMPLETE_ROOT).filter((f) => /^autocomplete.*\.test\.ts$/.test(f)).sort();
  for (const file of autocompleteFiles) {
    await runPort(
      join(AUTOCOMPLETE_ROOT, file),
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
        snippets.push({ source: "autocomplete", file, scope: context.scope, kind: "document", text: args[0] });
      },
      contexts,
      unreached,
    );
  }
  return { snippets, unreached };
}
