// The false-positive corpus run for the Luau lints, which
// `lintCorpus.mjs` bundles and runs; see that file for usage.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { SparkdownCompiler } from "../src/compiler/classes/SparkdownCompiler";
import { LUAU_LINT_CODES } from "../src/compiler/lint/collectLuauLints";
import type { SparkDiagnostic } from "../src/compiler/types/SparkDiagnostic";

interface Script {
  /** What the finding prints as its file. */
  label: string;
  text: string;
  /** Lines the corpus added above the file's own first line. */
  offset: number;
}

interface Finding {
  label: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

const LINT_CODES = new Set<string>(LUAU_LINT_CODES);

function uriOf(label: string) {
  return `file:///corpus/${encodeURIComponent(label)}`;
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
function lint(scripts: Script[], entries: Script[]): Finding[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: scripts.map((s) => ({
      uri: uriOf(s.label),
      type: "script",
      name: s.label.replace(/^.*\//, "").replace(/\.[^.]*$/, ""),
      ext: "sd",
      text: s.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });
  const byUri = new Map(scripts.map((s) => [uriOf(s.label), s]));
  const reported = new Map<string, SparkDiagnostic[]>();
  for (const entry of entries) {
    const uri = uriOf(entry.label);
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
      out.push({
        label: script.label,
        line: d.range.start.line + 1 - script.offset,
        column: d.range.start.character + 1,
        code: String(d.code),
        message: typeof d.message === "string" ? d.message : d.message.value,
      });
    }
  }
  return out;
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
  // wrapped in one, as the conformance tests wrap their snippets.
  const conformance = "packages/sparkdown/src/tests/luau-conformance/upstream/conformance";
  const luau = walk(join(repo, conformance))
    .filter((f) => f.endsWith(".luau"))
    .sort();
  const luauFindings: Finding[] = [];
  for (const full of luau) {
    const script = {
      label: slash(relative(repo, full)),
      text: `function run()\n${readFileSync(full, "utf8")}\nend\n`,
      offset: 1,
    };
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
