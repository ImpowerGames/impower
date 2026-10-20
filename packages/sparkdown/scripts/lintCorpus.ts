// The false-positive corpus run for the Luau lints, which
// `lintCorpus.mjs` bundles and runs; see that file for usage.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { lintBuiltinNames, SparkdownCompiler } from "../src/compiler/classes/SparkdownCompiler";
import { collectLuauLints, indexProgramNames, lintGlobalsUsedAsLocals, LUAU_LINT_CODES } from "../src/compiler/lint/collectLuauLints";
import type { SparkDiagnostic } from "../src/compiler/types/SparkDiagnostic";

export interface Script {
  /** What the finding prints as its file. */
  label: string;
  text: string;
  /** Lines the corpus added above the file's own first line. */
  offset: number;
}

export interface Finding {
  label: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

const LINT_CODES = new Set<string>(LUAU_LINT_CODES);

/** A script's URI. A wrapped conformance file is the `.sd` script its
 *  wrapper makes, so its URI ends in `.sd`: with its own `.luau` ending, the
 *  compiler would read it as a `.luau` file (`isLuauFile`). */
function uriOf(script: Script) {
  return `file:///corpus/${encodeURIComponent(script.label)}${script.offset ? ".sd" : ""}`;
}

/** A Luau conformance file as the corpus compiles it, wrapped in a function
 *  (sparkdown is Luau only inside one), with its line numbers kept. */
export function conformanceScript(label: string, fileText: string): Script {
  return { label, text: `function run()\n${fileText}\nend\n`, offset: 1 };
}

/** Runs `fn` with the console silenced: the compiler logs the diagnostics
 *  it hides from authors, which would bury the findings. */
function quietly<T>(fn: () => T): T {
  const saved = { ...console };
  for (const key of ["log", "info", "warn", "error", "debug"] as const) {
    console[key] = () => {};
  }
  try {
    return fn();
  } finally {
    Object.assign(console, saved);
  }
}

/** Compiles `scripts` as one program and returns the lints each reports. */
export function lint(scripts: Script[], entries: Script[]): Finding[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: scripts.map((s) => ({
      uri: uriOf(s),
      type: "script",
      name: s.label.replace(/^.*\//, "").replace(/\.[^.]*$/, ""),
      ext: "sd",
      text: s.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });
  const byUri = new Map(scripts.map((s) => [uriOf(s), s]));
  const reported = new Map<string, SparkDiagnostic[]>();
  for (const entry of entries) {
    const uri = uriOf(entry);
    if (reported.has(uri)) continue;
    const { program } = quietly(() =>
      compiler.compile({ textDocument: { uri } }),
    );
    for (const scriptUri of Object.keys(program.scripts)) {
      if (!reported.has(scriptUri)) {
        reported.set(scriptUri, program.diagnostics?.[scriptUri] ?? []);
      }
    }
  }
  const out: Finding[] = [];
  for (const [uri, diagnostics] of reported) {
    const script = byUri.get(uri);
    if (!script) continue;
    for (const d of diagnostics) {
      if (!LINT_CODES.has(String(d.code))) continue;
      // The wrapper a conformance file is read in is the corpus's, and
      // nothing calls it; its GlobalUsedAsLocal is read below instead.
      if (script.offset && d.code === "FunctionUnused" && d.range.start.line === 0) continue;
      if (script.offset && d.code === "GlobalUsedAsLocal") continue;
      out.push({
        label: script.label,
        line: d.range.start.line + 1 - script.offset,
        column: d.range.start.character + 1,
        code: String(d.code),
        message: typeof d.message === "string" ? d.message : d.message.value,
      });
    }
    if (script.offset) out.push(...moduleLevelGlobals(compiler, uri, script));
  }
  return out;
}

/**
 * GlobalUsedAsLocal for a wrapped conformance file at Luau's module level:
 * the program-wide rule run again over the script's cached facts with the
 * corpus's wrapper dropped from every reference's enclosing functions, so
 * the file's own top level is outside every function, as a Luau chunk's is
 * and as a script's top level is. Both of the rule's messages can then
 * report, and a function the file names `run` is still a function. Lines,
 * a "defined at line N" included, are the file's own.
 */
function moduleLevelGlobals(compiler: SparkdownCompiler, uri: string, script: Script): Finding[] {
  const doc = compiler.documents.get(uri);
  const tree = compiler.documents.tree(uri);
  if (!doc || !tree) return [];
  const facts = collectLuauLints(tree, (from, to) => doc.read(from, to));
  const wrapper = [...facts.names.functionStarts].find(([fn, from]) => from === 0 && fn.debugname === "run")?.[0];
  const references = facts.names.references.map((reference) => {
    const enclosingFunctions = reference.enclosingFunctions.filter((fn) => fn !== wrapper);
    return { ...reference, enclosingFunctions, enclosingFunction: enclosingFunctions[enclosingFunctions.length - 1] };
  });
  const program = indexProgramNames([{ uri, names: { ...facts.names, references } }]);
  const line = (_uri: string, offset: number) => doc.positionAt(offset).line + 1 - script.offset;
  return lintGlobalsUsedAsLocals(program, [{ uri, ...facts }], lintBuiltinNames(), line).map(({ lint: found }) => {
    const at = doc.positionAt(found.from);
    return { label: script.label, line: at.line + 1 - script.offset, column: at.character + 1, code: found.code, message: found.message };
  });
}

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const slash = (path: string) => path.split("\\").join("/");

/** Prints the findings for the repository at `repo` and, when given, the
 *  project directory `project`. */
export function main(repo: string, project?: string) {
  const findings: Finding[] = [];
  const counts: string[] = [];
  const run = (name: string, list: Finding[], files: number) => {
    findings.push(...list);
    counts.push(`${name}: ${files} files, ${list.length} findings`);
  };

  // Each repository script on its own, as the tests and examples are written.
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "*.sd"], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
  const repoFindings: Finding[] = [];
  for (const path of tracked) {
    const script = {
      label: path,
      text: readFileSync(join(repo, path), "utf8"),
      offset: 0,
    };
    repoFindings.push(...lint([script], [script]));
  }
  run("repository .sd files", repoFindings, tracked.length);

  // Luau is sparkdown only inside a function, so each conformance file is
  // wrapped in one, as the conformance tests wrap their snippets; its
  // GlobalUsedAsLocal is read at module level (`moduleLevelGlobals`).
  const conformance = "packages/sparkdown/src/tests/luau-conformance/upstream/conformance";
  const luau = walk(join(repo, conformance))
    .filter((f) => f.endsWith(".luau"))
    .sort();
  const luauFindings: Finding[] = [];
  for (const full of luau) {
    const script = conformanceScript(slash(relative(repo, full)), readFileSync(full, "utf8"));
    luauFindings.push(...lint([script], [script]));
  }
  run("Luau conformance files", luauFindings, luau.length);

  // A project compiles as one program, from `main.sd` and then any script
  // `main.sd` does not include.
  if (project) {
    const scripts = walk(project)
      .filter((f) => f.endsWith(".sd"))
      .sort()
      .map((full) => ({
        label: `project/${slash(relative(project!, full))}`,
        text: readFileSync(full, "utf8"),
        offset: 0,
      }));
    const main = scripts.filter((s) => s.label === "project/main.sd");
    run("project", lint(scripts, [...main, ...scripts]), scripts.length);
  }

  findings.sort(
    (a, b) =>
      (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
      a.line - b.line ||
      a.column - b.column ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
  for (const f of findings) {
    console.log(`${f.label}:${f.line}:${f.column} ${f.code} ${f.message}`);
  }
  for (const line of counts) console.error(line);
}
