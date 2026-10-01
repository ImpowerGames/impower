// The struct-body converter (#1229), which `convertStructBodies.mjs` bundles
// and runs; see that file for usage.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { SparkdownCompiler } from "../src/compiler/classes/SparkdownCompiler";
import { rewriteStructBodies, type Refusal } from "./structBodyRewrite";

export interface Source {
  /** How the report names the file, and the name it compiles under. */
  label: string;
  text: string;
}

export interface Conversion {
  label: string;
  before: string;
  after: string;
  declarations: number;
  converted: number;
  refusals: Refusal[];
}

export interface ProgramComparison {
  /** Where the normalized programs differ; empty when they agree. */
  differences: string[];
  /** The fields compared, each with its size, for the report. */
  compared: string[];
  /** The sources the program compiled from the entry holds. */
  reached: string[];
}

/** Runs `fn` with the console silenced: the compiler logs what it hides
 *  from authors, which would bury the report. */
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

const uriOf = (label: string) =>
  `file:///convert/${label.split("/").map(encodeURIComponent).join("/")}`;

/** True for the builtins prelude, which compiles on its own, as
 *  `getCompiledPrelude` compiles it, rather than on top of itself. */
export const isPrelude = (label: string) =>
  label.split(sep).join("/").endsWith("src/compiler/builtins/builtins.sd");

/** Compiles `sources` as one program from `entry`. */
export function compile(sources: Source[], entry: string, prelude: boolean) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...(prelude ? {} : { useBuiltinsPrelude: false, definitions: { builtins: {} } }),
    files: sources.map((s) => ({
      uri: uriOf(s.label),
      type: "script",
      name: basename(s.label).replace(/\.[^.]*$/, ""),
      ext: "sd",
      text: s.text,
      version: 1,
      languageId: "sparkdown",
    })),
  } as any);
  return quietly(() => compiler.compile({ textDocument: { uri: uriOf(entry) } }).program);
}

/** Every path at which two values differ, up to `limit`. */
export function differences(
  a: unknown,
  b: unknown,
  limit = 20,
  path = "",
  out: string[] = [],
): string[] {
  if (out.length >= limit || Object.is(a, b)) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    out.push(`${path || "(root)"}: ${preview(a)} != ${preview(b)}`);
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: ${preview(a)} != ${preview(b)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const key of keys) {
    differences((a as any)[key], (b as any)[key], limit, `${path}.${key}`, out);
    if (out.length >= limit) break;
  }
  return out;
}

const preview = (v: unknown) => {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 100 ? `${s.slice(0, 97)}...` : s;
};

// Tables of source positions, a per-compiler revision counter, and the forms
// of the program derived from the same data as `compiled` (the binary buffer
// and its chunks), which is compared itself.
const IGNORED = new Set([
  "pathLocations",
  "functionLocations",
  "sceneLocations",
  "branchLocations",
  "knotLocations",
  "stitchLocations",
  "labelLocations",
  "dataLocations",
  "colorAnnotations",
  "files",
  "compiledBuffer",
  "chunks",
  "changes",
  "contextRevision",
]);

/** A layout tree node's source position: `{ line, from, to }`. */
const isSpan = (value: unknown): boolean =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as any).from === "number" &&
  typeof (value as any).to === "number";

/**
 * The layout tree (`program.sparkle`) without its nodes' source positions,
 * and the generated names it holds. A binding, condition or loop is compiled
 * into a function named after its source offset
 * (`__binding_<uri>__layout_main_2310`), which the tree names in `exprId`
 * and the compiled story and scene assets hold as a key.
 */
function readLayoutTree(value: unknown, names: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => readLayoutTree(v, names));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === "span" && isSpan(v)) continue;
    if (key === "exprId" && typeof v === "string" && !names.has(v)) {
      names.set(v, `__generated_name_${names.size}`);
    }
    out[key] = readLayoutTree(v, names);
  }
  return out;
}

/** `value` with every key or string that is exactly a generated name, or
 *  such a name followed by a `.path`, replaced by its number. */
function renameGenerated(value: unknown, names: Map<string, string>): unknown {
  const rename = (s: string) => {
    const exact = names.get(s);
    if (exact) return exact;
    const dot = s.indexOf(".");
    const prefix = dot > 0 ? names.get(s.slice(0, dot)) : undefined;
    return prefix ? prefix + s.slice(dot) : s;
  };
  if (typeof value === "string") return rename(value);
  if (Array.isArray(value)) return value.map((v) => renameGenerated(v, names));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[rename(key)] = renameGenerated(v, names);
  }
  return out;
}

/**
 * A program without source positions or the names derived from them, as
 * plain data: location tables dropped, the layout tree's spans dropped, the
 * generated names its `exprId`s hold numbered in the order the tree holds
 * them and renamed wherever they appear exactly (authored text is never
 * renamed), and each diagnostic as its severity, code and message.
 */
export function normalizeProgram(program: any) {
  const names = new Map<string, string>();
  const out: Record<string, unknown> = {};
  out["sparkle"] = readLayoutTree(program.sparkle, names);
  for (const key of Object.keys(program)) {
    if (IGNORED.has(key) || key === "diagnostics" || key === "sparkle") continue;
    out[key] = program[key];
  }
  const normalized = renameGenerated(JSON.parse(JSON.stringify(out)), names) as Record<
    string,
    unknown
  >;
  // A diagnostic's range is a source position, and the text it underlines
  // can be the converted syntax itself (`- targets:` becomes `{`), so a
  // diagnostic is compared by its severity, code and message.
  normalized["diagnostics"] = Object.fromEntries(
    Object.entries(program.diagnostics ?? {}).map(([uri, list]) => [
      uri,
      (list as any[])
        .map((d) => {
          const message = typeof d.message === "string" ? d.message : d.message?.value;
          return `${d.severity} ${d.code ?? ""} ${message}`;
        })
        .sort(),
    ]),
  );
  return normalized;
}

/** Compiles the sources before and after and compares the programs. */
export function comparePrograms(
  before: Source[],
  after: Source[],
  entry: string,
  prelude: boolean,
): ProgramComparison {
  const programBefore = compile(before, entry, prelude);
  const a = normalizeProgram(programBefore);
  const b = normalizeProgram(compile(after, entry, prelude));
  const size = (v: unknown) =>
    v && typeof v === "object" ? Object.keys(v).length : v === undefined ? 0 : 1;
  const compared = Object.keys(a)
    .sort()
    .map((key) =>
      key === "diagnostics"
        ? `diagnostics (${Object.values(a["diagnostics"] as Record<string, unknown[]>).flat().length})`
        : `${key} (${size(a[key])})`,
    );
  const uris = new Set(Object.keys(programBefore.scripts ?? {}));
  const reached = before.map((s) => s.label).filter((label) => uris.has(uriOf(label)));
  return { differences: differences(a, b, 20), compared, reached };
}

/** Rewrites each source, without compiling. */
export function convertSources(sources: Source[]): Conversion[] {
  return sources.map((s) => {
    const result = rewriteStructBodies(s.text);
    return {
      label: s.label,
      before: s.text,
      after: result.text,
      declarations: result.declarations,
      converted: result.converted,
      refusals: result.refusals,
    };
  });
}

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".sd")) out.push(full);
  }
  return out;
}

const slash = (path: string) => path.split(sep).join("/");

const USAGE = `Usage:
  node packages/sparkdown/scripts/convertStructBodies.mjs [--check] <file.sd> [<file.sd> ...]
  node packages/sparkdown/scripts/convertStructBodies.mjs [--check] --project <dir>`;

/**
 * Converts the files `args` names, or a project directory compiled from its
 * `main.sd`. Prints a report and returns the exit code: 1 when a file's
 * programs differ or a declaration was refused, 2 for a usage error.
 */
export function main(cwd: string, args: string[]): number {
  let check = false;
  let project: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--check") check = true;
    else if (arg === "--project") {
      project = args[++i];
      if (!project || project.startsWith("--")) {
        console.error(`--project needs a directory\n${USAGE}`);
        return 2;
      }
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}\n${USAGE}`);
      return 2;
    } else files.push(arg);
  }
  if ((project ? 1 : 0) + (files.length ? 1 : 0) !== 1) {
    console.error(USAGE);
    return 2;
  }

  let failed = false;
  const report = (c: Conversion) => {
    for (const r of c.refusals) {
      failed = true;
      console.log(
        `${c.label}:${r.line}: refused the declaration at line ${r.declaration}: ${r.reason}`,
      );
    }
  };
  const write = (path: string, c: Conversion) => {
    if (!check && c.after !== c.before) writeFileSync(path, c.after);
  };
  const summary = (c: Conversion) =>
    `${c.converted} of ${c.declarations} struct-body declarations converted` +
    (c.refusals.length ? `, ${c.refusals.length} refused` : "");

  if (project) {
    const root = resolve(cwd, project);
    if (!statSync(join(root, "main.sd"), { throwIfNoEntry: false })) {
      console.error(`${project} has no main.sd`);
      return 2;
    }
    const paths = walk(root).sort();
    const sources = paths.map((p) => ({ label: slash(relative(root, p)), text: readFileSync(p, "utf8") }));
    const conversions = convertSources(sources);
    for (const c of conversions) {
      console.log(`${slash(join(project, c.label))}: ${c.after === c.before ? "unchanged" : summary(c)}`);
      report({ ...c, label: slash(join(project, c.label)) });
    }
    if (conversions.every((c) => c.after === c.before)) return failed ? 1 : 0;
    const after = conversions.map((c) => ({ label: c.label, text: c.after }));
    // The project compiles from `main.sd`, and then, as `lintCorpus.mjs`
    // compiles a project, from each changed script that program does not
    // hold, so every file written is in a program that was compared.
    const reached = new Set<string>();
    let differ = false;
    for (const c of [{ label: "main.sd" }, ...conversions.filter((c) => c.after !== c.before)]) {
      if (c.label !== "main.sd" && reached.has(c.label)) continue;
      const comparison = comparePrograms(sources, after, c.label, true);
      comparison.reached.forEach((label) => reached.add(label));
      reached.add(c.label);
      console.log(`compared from ${c.label}: ${comparison.compared.join(", ")}`);
      if (comparison.differences.length) {
        differ = true;
        console.log(`programs differ:\n  ${comparison.differences.join("\n  ")}`);
      }
    }
    if (differ) {
      console.log("nothing written");
      return 1;
    }
    console.log(`programs identical${check ? " (--check: nothing written)" : ""}`);
    conversions.forEach((c, i) => write(paths[i]!, c));
    return failed ? 1 : 0;
  }

  for (const file of files) {
    const path = resolve(cwd, file);
    const label = slash(file);
    const [c] = convertSources([{ label, text: readFileSync(path, "utf8") }]);
    if (c!.after === c!.before) {
      console.log(`${label}: unchanged`);
      report(c!);
      continue;
    }
    console.log(`${label}: ${summary(c!)}`);
    report(c!);
    // Each file compiles on its own, under its own name, as an entry.
    const name = basename(label);
    const comparison = comparePrograms(
      [{ label: name, text: c!.before }],
      [{ label: name, text: c!.after }],
      name,
      !isPrelude(label),
    );
    console.log(`  compared: ${comparison.compared.join(", ")}`);
    if (comparison.differences.length) {
      failed = true;
      console.log(`  programs differ; file left untouched:\n    ${comparison.differences.join("\n    ")}`);
      continue;
    }
    console.log(`  programs identical${check ? " (--check: nothing written)" : ""}`);
    write(path, c!);
  }
  return failed ? 1 : 0;
}
