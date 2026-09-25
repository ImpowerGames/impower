// How a ported case of Luau's type-checker tests is written down and run.
// Each port file in this directory hands its cases to `portUpstreamFile`;
// `README.md` explains the conventions, and `../typecheckTestHarness.ts`
// compiles the snippets.

import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  checkLuau,
  describeDiagnostic,
  NotImplemented,
  type LuauCheckResult,
  type LuauMode,
  type LuauToStringOptions,
  type TypeSelector,
} from "../typecheckTestHarness";

/** What upstream checks about one `check()` result, in upstream order. */
export type Assertion =
  /** `LUAU_REQUIRE_ERROR_COUNT(n)`, or `LUAU_REQUIRE_ERRORS` as `"some"`. */
  | { errors: number | "some" }
  /** Facts about the error at an index: `get<Kind>(result.errors[i])`, its text, location or fields. */
  | {
      error: number;
      code?: string;
      message?: string | { oneOf: string[] };
      /** `[beginLine, beginColumn, endLine, endColumn]`. */
      location?: [number, number, number, number];
      /** Only the line the error begins on. */
      line?: number;
      /** Fields of the error, as its Luau struct names them; a type field is compared printed. */
      fields?: Record<string, unknown>;
    }
  /** `LUAU_REQUIRE_ERROR(result, Kind)`: an error of the kind somewhere. */
  | { anyError: string }
  /** `LUAU_REQUIRE_NO_ERROR(result, Kind)`. */
  | { noError: string }
  /** A fact about a type: printed text, class, identity, return pack or type parameter count. */
  | (TypeSelector & {
      equals?: string;
      options?: LuauToStringOptions;
      kind?: string;
      sameAs?: TypeSelector;
      results?: string[];
      typeParameters?: number;
    });

/**
 * Why Sparkdown cannot parse a snippet yet: a filed defect, or a section of
 * `packages/sparkdown/docs/runtime/DIVERGENCES.md` that documents the
 * difference, named by its heading.
 */
export type Unparsed = { defect: number } | { divergence: string };

export interface PortedCheck {
  /** The Luau source, exactly as upstream writes it. */
  source: string;
  /** The module name upstream gives the source (`fileResolver.source["..."]`). */
  module?: string;
  /** `Fixture::check(mode, source)`; strict when upstream names none. */
  mode?: LuauMode;
  /** For a plain `TEST_CASE`, the fixture it builds for this check. */
  fixture?: string;
  /** Upstream calls `ignoreMissingAnnotations(result)`: drop `TypeAnnotationRequired` errors first. */
  ignoreMissingAnnotations?: true;
  /**
   * The Luau syntax error the snippet contains on purpose. Sparkdown's
   * reading of a malformed snippet is not part of the parse check.
   */
  malformed?: string;
  /**
   * Sparkdown cannot parse the snippet yet. The parse check then expects it
   * to fail, so the record goes as soon as the snippet parses.
   */
  unparsed?: Unparsed;
  /** This check sits in a block of its own under `DOES_NOT_PASS_NEW_SOLVER_GUARD`. */
  doesNotPassNewSolver?: true;
  expect: Assertion[];
}

/** Why a case's type assertions never run, whatever Sparkdown parses. */
export type CaseSkip =
  /**
   * Upstream runs the case on the old solver only: under
   * `DOES_NOT_PASS_NEW_SOLVER_GUARD` (`NEW_SOLVER_GUARD_REASON`), or behind
   * an early return on the new solver (the reason given).
   */
  | { newSolver: string }
  /** The case cannot apply to Sparkdown, for the reason given. */
  | { notApplicable: string }
  /** Upstream never compiles the case. */
  | { disabledUpstream: true };

export const NEW_SOLVER_GUARD_REASON = "does not pass on Luau's new solver upstream";

/** One upstream case: a single check written inline, or several under `checks`. */
export type PortedCase = {
  /** The upstream case name, exactly. */
  name: string;
  /** The upstream fixture; absent for a plain `TEST_CASE`. */
  fixture?: string;
  /** Luau flags the case sets with `ScopedFastFlag`, other than the solver switch. */
  flags?: Record<string, boolean>;
  skip?: CaseSkip;
} & (({ checks?: undefined } & PortedCheck) | { checks: PortedCheck[]; source?: undefined });

export function checksOf(c: PortedCase): PortedCheck[] {
  if (c.checks) return c.checks;
  const { name: _name, fixture: _fixture, flags: _flags, skip: _skip, checks: _checks, ...check } = c;
  return [check];
}

// ---------------------------------------------------------------------------
// The area switch
// ---------------------------------------------------------------------------

/**
 * The upstream files whose type assertions run. Each file's area is turned
 * on by the checker slice that implements it; until then its cases check only
 * that their snippets parse.
 */
export const CHECKED_AREAS: readonly string[] = [];

/**
 * `LUAU_TYPECHECK_AREAS=all`, or a comma-separated list of upstream files,
 * turns areas on without editing `CHECKED_AREAS`. Before the checker exists,
 * that proves the assertions are wired: each fails with "not implemented".
 */
export function areaIsChecked(file: string, env: Record<string, string | undefined> = process.env): boolean {
  const forced = env["LUAU_TYPECHECK_AREAS"]?.split(",").map((f) => f.trim()) ?? [];
  return forced.includes("all") || forced.includes(file) || CHECKED_AREAS.includes(file);
}

// ---------------------------------------------------------------------------
// The upstream manifest
// ---------------------------------------------------------------------------

export interface ManifestCase {
  name: string;
  fixture?: string;
  doesNotPassNewSolver?: true | "partly";
  disabledUpstream?: string;
}

export interface Manifest {
  pin: string;
  errorKinds: string[];
  files: Record<string, ManifestCase[]>;
}

const HERE = dirname(fileURLToPath(import.meta.url));

let manifestCache: Manifest | undefined;
/** `../upstream/typecheck-cases.json`, which `scripts/generateTypecheckCases.ts` writes. */
export function loadManifest(): Manifest {
  manifestCache ??= JSON.parse(
    readFileSync(join(HERE, "..", "upstream", "typecheck-cases.json"), "utf8"),
  ) as Manifest;
  return manifestCache;
}

let divergenceCache: string[] | undefined;
/** The `###` section headings of `DIVERGENCES.md`, which a divergence names. */
export function divergenceHeadings(): string[] {
  divergenceCache ??= readFileSync(join(HERE, "..", "..", "..", "..", "docs", "runtime", "DIVERGENCES.md"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("### "))
    .map((line) => line.slice("### ".length).trim());
  return divergenceCache;
}

/** Luau's type classes (`TypeVariant` in `Type.h`, with the bound and error types it wraps). */
export const LUAU_TYPE_KINDS: readonly string[] = [
  "BoundType",
  "ErrorType",
  "FreeType",
  "GenericType",
  "PrimitiveType",
  "SingletonType",
  "BlockedType",
  "PendingExpansionType",
  "FunctionType",
  "TableType",
  "MetatableType",
  "ExternType",
  "AnyType",
  "UnionType",
  "IntersectionType",
  "LazyType",
  "UnknownType",
  "NeverType",
  "NegationType",
  "NoRefineType",
  "TypeFunctionInstanceType",
];

// ---------------------------------------------------------------------------
// Checking a port against the manifest and itself
// ---------------------------------------------------------------------------

const ASSERTION_KEYS: Record<string, readonly string[]> = {
  errors: ["errors"],
  error: ["error", "code", "message", "location", "line", "fields"],
  anyError: ["anyError"],
  noError: ["noError"],
  type: ["type", "alias", "typeAt", "path", "equals", "options", "kind", "sameAs", "results", "typeParameters"],
};

const PATH_STEPS = ["property", "argument", "result", "indexer", "typeParameter"];

const TO_STRING_OPTIONS: readonly (keyof LuauToStringOptions)[] = [
  "exhaustive",
  "useLineBreaks",
  "functionTypeArguments",
  "hideTableKind",
  "hideNamedFunctionTypeParameters",
  "hideFunctionSelfArgument",
  "hideTableAliasExpansions",
  "useQuestionMarks",
  "ignoreSyntheticName",
];

function assertionShape(a: Assertion): keyof typeof ASSERTION_KEYS {
  if ("errors" in a) return "errors";
  if ("error" in a) return "error";
  if ("anyError" in a) return "anyError";
  if ("noError" in a) return "noError";
  return "type";
}

function selectorProblems(s: TypeSelector, where: string): string[] {
  const subjects = (["type", "alias", "typeAt"] as const).filter((k) => k in s);
  const problems: string[] = [];
  if (subjects.length !== 1) problems.push(`${where} names ${subjects.length} of type, alias and typeAt; it needs exactly one`);
  for (const step of s.path ?? []) {
    const keys = Object.keys(step);
    if (keys.length !== 1 || !PATH_STEPS.includes(keys[0]!)) {
      problems.push(`${where} has a path step ${JSON.stringify(step)} that is not one of ${PATH_STEPS.join(", ")}`);
    }
  }
  return problems;
}

function assertionProblems(a: Assertion, where: string, errorKinds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const shape = assertionShape(a);
  const unknown = Object.keys(a).filter((key) => !ASSERTION_KEYS[shape]!.includes(key));
  if (unknown.length) problems.push(`${where} has keys ${unknown.join(", ")} that a ${shape} assertion does not take`);
  if ("error" in a && a.code !== undefined && !errorKinds.has(a.code)) problems.push(`${where} names ${a.code}, which is not a Luau error kind`);
  if ("anyError" in a && !errorKinds.has(a.anyError)) problems.push(`${where} names ${a.anyError}, which is not a Luau error kind`);
  if ("noError" in a && !errorKinds.has(a.noError)) problems.push(`${where} names ${a.noError}, which is not a Luau error kind`);
  if (shape === "type") {
    const t = a as TypeSelector & { kind?: string; sameAs?: TypeSelector; options?: LuauToStringOptions; equals?: string };
    problems.push(...selectorProblems(t, where));
    if (t.sameAs) problems.push(...selectorProblems(t.sameAs, `${where} sameAs`));
    if (t.kind !== undefined && !LUAU_TYPE_KINDS.includes(t.kind)) problems.push(`${where} names ${t.kind}, which is not a Luau type class`);
    const badOptions = Object.keys(t.options ?? {}).filter((o) => !TO_STRING_OPTIONS.includes(o as keyof LuauToStringOptions));
    if (badOptions.length) problems.push(`${where} has toString options ${badOptions.join(", ")} that Luau does not have`);
    if (t.options && t.equals === undefined) problems.push(`${where} has toString options but nothing printed to compare`);
  }
  return problems;
}

function checkProblems(check: PortedCheck, where: string, errorKinds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (typeof check.source !== "string") problems.push(`${where} has no source`);
  if (check.malformed !== undefined && !check.malformed) problems.push(`${where} is malformed with no description of its syntax error`);
  if (check.malformed && check.unparsed) problems.push(`${where} is both malformed and unparsed; the parse check skips a malformed snippet`);
  if (check.unparsed && "defect" in check.unparsed && !(Number.isInteger(check.unparsed.defect) && check.unparsed.defect > 0)) {
    problems.push(`${where} records an unparsed defect that is not an issue number`);
  }
  if (check.unparsed && "divergence" in check.unparsed && !divergenceHeadings().includes(check.unparsed.divergence)) {
    problems.push(`${where} names a divergence "${check.unparsed.divergence}" that is not a heading in DIVERGENCES.md`);
  }
  if (check.module !== undefined && !check.module) problems.push(`${where} has an empty module name`);
  check.expect.forEach((a, j) => problems.push(...assertionProblems(a, `${where} assertion ${j}`, errorKinds)));
  return problems;
}

/** Everything wrong with a ported file, compared with the manifest's entry for its upstream file. */
export function portProblems(file: string, cases: PortedCase[], manifest: Manifest): string[] {
  const problems: string[] = [];
  const upstream = manifest.files[file];
  if (!upstream) return [`${file} is not in upstream/typecheck-cases.json`];

  const names = cases.map((c) => c.name);
  const expected = upstream.map((c) => c.name);
  const missing = expected.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !expected.includes(n));
  if (missing.length) problems.push(`missing upstream cases: ${missing.join(", ")}`);
  if (extra.length) problems.push(`cases not in ${file} upstream: ${extra.join(", ")}`);
  if (!missing.length && !extra.length && JSON.stringify(names) !== JSON.stringify(expected)) {
    problems.push("the cases are not in upstream order, or a repeated name is ported a different number of times");
  }

  const errorKinds = new Set(manifest.errorKinds);
  cases.forEach((c, i) => {
    const where = `case ${c.name}`;
    const up = upstream[i];
    if (up && up.name === c.name) problems.push(...upstreamProblems(c, up, where));
    const checks = checksOf(c);
    if (!checks.length && !c.skip) problems.push(`${where} has no checks and no skip`);
    if (c.skip && "newSolver" in c.skip && !c.skip.newSolver) problems.push(`${where} has an empty new-solver reason`);
    if (c.skip && "notApplicable" in c.skip && !c.skip.notApplicable) problems.push(`${where} has an empty not-applicable reason`);
    checks.forEach((check, k) => problems.push(...checkProblems(check, checks.length > 1 ? `${where} check ${k}` : where, errorKinds)));
  });
  return problems;
}

// How a case must be marked, given what upstream says about it.
function upstreamProblems(c: PortedCase, up: ManifestCase, where: string): string[] {
  const problems: string[] = [];
  if (up.fixture !== c.fixture) {
    problems.push(`${where} has fixture ${c.fixture ?? "(none)"}, upstream ${up.fixture ?? "(none)"}`);
  }
  const guarded = Boolean(c.skip && "newSolver" in c.skip && c.skip.newSolver === NEW_SOLVER_GUARD_REASON);
  if ((up.doesNotPassNewSolver === true) !== guarded) {
    problems.push(
      up.doesNotPassNewSolver === true
        ? `${where} is under DOES_NOT_PASS_NEW_SOLVER_GUARD upstream; skip it with { newSolver: NEW_SOLVER_GUARD_REASON }`
        : `${where} is skipped with the new-solver guard's reason, but upstream has no guard over the whole case`,
    );
  }
  const partly = checksOf(c).some((check) => check.doesNotPassNewSolver);
  if ((up.doesNotPassNewSolver === "partly") !== partly) {
    problems.push(
      up.doesNotPassNewSolver === "partly"
        ? `${where} guards some of its checks upstream; mark those checks doesNotPassNewSolver`
        : `${where} marks a check doesNotPassNewSolver, but upstream guards no block within the case`,
    );
  }
  const disabled = Boolean(c.skip && "disabledUpstream" in c.skip);
  if ((up.disabledUpstream !== undefined) !== disabled) {
    problems.push(
      up.disabledUpstream !== undefined
        ? `${where} is disabled upstream (${up.disabledUpstream}); skip it with { disabledUpstream: true }`
        : `${where} is skipped as disabled upstream, but upstream compiles it`,
    );
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Running a ported case
// ---------------------------------------------------------------------------

/**
 * Runs a case outside vitest's registration: the parse check on every
 * snippet, then the type assertions when nothing skips the case and its area
 * is on. `check` compiles a snippet; tests give a stand-in.
 */
export function runPortedCase(
  file: string,
  c: PortedCase,
  skip: () => void,
  check: typeof checkLuau = checkLuau,
): void {
  const checks = checksOf(c);
  const results = checks.map((ch) => ({
    check: ch,
    result: check(ch.source, { mode: ch.mode, fixture: ch.fixture ?? c.fixture }),
  }));

  // A snippet recorded as unparsed must still fail to parse, so the record
  // goes as soon as the defect is fixed or the divergence removed.
  for (const { check: ch, result } of results) {
    if (ch.malformed) continue;
    if (ch.unparsed) {
      expect(
        result.syntaxDiagnostics.length,
        `the snippet now parses cleanly, so remove its record ${JSON.stringify(ch.unparsed)}`,
      ).toBeGreaterThan(0);
    } else {
      expect(result.syntaxDiagnostics.map(describeDiagnostic), "Sparkdown did not read the snippet as Luau").toEqual([]);
    }
  }

  if (c.skip || checks.some((ch) => ch.unparsed)) {
    skip();
    return;
  }
  if (!areaIsChecked(file)) return;
  for (const { check: ch, result } of results) {
    if (ch.doesNotPassNewSolver) continue;
    runAssertions(result, ch);
  }
}

/** Runs one check's assertions against its result, in order. */
export function runAssertions(result: LuauCheckResult, check: PortedCheck): void {
  if (!result.checked) {
    throw new NotImplemented(`the assertions on ${JSON.stringify(check.source.trim().split("\n")[0])}`);
  }
  const all = check.ignoreMissingAnnotations
    ? result.diagnostics.filter((d) => d.code !== "TypeAnnotationRequired")
    : result.diagnostics;
  const listed = all.map(describeDiagnostic);
  for (const a of check.expect) {
    if ("errors" in a) {
      if (a.errors === "some") expect(all.length, "expected errors").toBeGreaterThan(0);
      else expect(listed, `expected ${a.errors} errors`).toHaveLength(a.errors);
    } else if ("error" in a) {
      const d = all[a.error];
      expect(d, `expected an error at index ${a.error}: ${JSON.stringify(listed)}`).toBeDefined();
      if (!d) continue;
      if (a.code !== undefined) expect(d.code).toBe(a.code);
      if (typeof a.message === "string") expect(d.message).toBe(a.message);
      else if (a.message) expect(a.message.oneOf).toContain(d.message);
      if (a.location) expect([d.line, d.column, d.endLine, d.endColumn]).toEqual(a.location);
      if (a.line !== undefined) expect(d.line).toBe(a.line);
      if (a.fields) expect(d.data ?? {}).toMatchObject(a.fields);
    } else if ("anyError" in a) {
      expect(all.map((d) => d.code)).toContain(a.anyError);
    } else if ("noError" in a) {
      expect(all.map((d) => d.code)).not.toContain(a.noError);
    } else {
      const t = result.find(selectorOf(a));
      if (a.equals !== undefined) expect(t.print(a.options)).toBe(a.equals);
      if (a.kind !== undefined) expect(t.kind).toBe(a.kind);
      if (a.sameAs) expect(t.is(result.find(selectorOf(a.sameAs))), `same type as ${JSON.stringify(a.sameAs)}`).toBe(true);
      if (a.results) expect(t.results?.map((r) => r.print())).toEqual(a.results);
      if (a.typeParameters !== undefined) expect(t.typeParameterCount).toBe(a.typeParameters);
    }
  }
}

// Only the selector of a type assertion goes to the checker.
function selectorOf(s: TypeSelector): TypeSelector {
  const path = s.path ? { path: s.path } : {};
  if ("type" in s) return { type: s.type, ...path };
  if ("alias" in s) return { alias: s.alias, ...path };
  return { typeAt: s.typeAt, ...path };
}

export const COVERAGE_TEST = "the port covers every upstream case";

/**
 * Registers a ported file: one test per upstream case, named as the case is,
 * and a test that the port covers exactly the upstream file's cases.
 */
export function portUpstreamFile(file: string, cases: PortedCase[]): void {
  describe(file, () => {
    for (const c of cases) {
      test(c.name, (ctx) => runPortedCase(file, c, () => ctx.skip()));
    }
    test(COVERAGE_TEST, () => {
      const testPath = expect.getState().testPath ?? "";
      expect(basename(testPath), "a port is named after its upstream file").toBe(file.replace(/\.cpp$/, ".ts"));
      expect(portProblems(file, cases, loadManifest())).toEqual([]);
    });
  });
}
