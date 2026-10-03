// How a ported case of Luau's type-checker tests is written down and run.
// Each port file in this directory hands its cases to `portUpstreamFile`;
// `README.md` explains the conventions, and `../typecheckTestHarness.ts`
// compiles the snippets.

import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { Location, Position } from "../../../compiler/typecheck/Location";
import {
  checkLuau,
  createLuauCheckSession,
  describeDiagnostic,
  NotImplemented,
  type LuauCheckResult,
  type LuauMode,
  type LuauToStringOptions,
  type TypePathStep,
  type TypeSelector,
  type LocationTuple,
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
      messageContains?: string;
      messageExcludes?: string;
      /** `[beginLine, beginColumn, endLine, endColumn]`. */
      location?: [number, number, number, number];
      /** Only the line the error begins on. */
      line?: number;
      endLine?: number;
      /** Fields of the error, as its Luau struct names them; a type field is compared printed. */
      fields?: Record<string, unknown>;
      fieldOptions?: Record<string, LuauToStringOptions>;
      fieldLocations?: Record<string, { present?: boolean; line?: number }>;
      moduleMatchesCheck?: true;
    }
  /** `LUAU_REQUIRE_ERROR(result, Kind)`: an error of the kind somewhere. */
  | { anyError: string }
  /** `LUAU_REQUIRE_NO_ERROR(result, Kind)`. */
  | { noError: string }
  /** A fact about every error, without asserting their count. */
  | { everyError: { line?: number; messageExcludes?: string } }
  /** Exact decorateWithTypes output, including its whitespace. */
  | { decoratedSource: string }
  | {
      scopes: {
        minimum?: number;
        count?: number;
        importedModules?: { scope: number; name: string; module: string }[];
        aliases?: ((
          | { scope: number; scopeAt?: never }
          | { scopeAt: [number, number]; scope?: never }
        ) & { name: string; location: LocationTuple })[];
      };
    }
  /** A fact about a type: printed text, class, identity, return pack, type parameter count or property count. */
  | (TypeSelector & {
      equals?: string;
      notEquals?: string;
      options?: LuauToStringOptions;
      kind?: string;
      sameAs?: TypeSelector;
      notSameAs?: TypeSelector;
      printedSameAs?: TypeSelector;
      subtypeOf?: TypeSelector;
      isSubtype?: boolean;
      results?: string[];
      typeParameters?: number;
      properties?: number;
      arguments?: { length?: number; tail?: boolean; tailKind?: string };
      returns?: { length?: number; tail?: boolean; tailKind?: string };
      hasSelf?: boolean;
      polarity?: "Mixed" | "Positive" | "Negative" | "Unknown";
      instantiatedTypeParameters?: number;
      instantiatedTypePackParameters?: number;
      generics?: number;
      genericPacks?: number;
      name?: string;
      definitionLocation?: LocationTuple;
      hasProperty?: string[];
      propertyLocations?: Record<
        string,
        { location?: LocationTuple | null; typeLocation?: LocationTuple | null }
      >;
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
  definitions?: string[];
  globals?: Record<string, string>;
  moduleSources?: Record<string, string>;
  hiddenTypes?: true;
  retainFullTypeGraphs?: false;
  clearModules?: true;
  /** Upstream calls `ignoreMissingAnnotations(result)`: drop `TypeAnnotationRequired` errors first. */
  ignoreMissingAnnotations?: true;
  /**
   * Sparkdown cannot parse the snippet yet. The parse check then expects it
   * to fail, so the record goes as soon as the snippet parses.
   */
  unparsed?: Unparsed;
  /**
   * Luau's parser rejects the snippet too, for the reason given. The parse
   * check then expects Sparkdown to report a syntax diagnostic, and the
   * assertions still run.
   */
  malformed?: string;
  /** This check sits in a block of its own under `DOES_NOT_PASS_NEW_SOLVER_GUARD`. */
  doesNotPassNewSolver?: true;
  /**
   * This check cannot apply to Sparkdown, for the reason given: its snippet
   * still gets the parse check, and its assertions never run.
   */
  notApplicable?: string;
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

export const NEW_SOLVER_GUARD_REASON =
  "does not pass on Luau's new solver upstream";

/** One upstream case: a single check written inline, or several under `checks`. */
export type PortedCase = {
  /** The upstream case name, exactly. */
  name: string;
  /** The upstream fixture; absent for a plain `TEST_CASE`. */
  fixture?: string;
  /** Luau flags the case sets with `ScopedFastFlag`, other than the solver switch. */
  flags?: Record<string, boolean>;
  shareFixture?: true;
  /**
   * Luau limits the case sets with `ScopedFastInt`. The harness cannot apply
   * them, so once the case's area is on it fails as not implemented rather
   * than asserting what upstream sees only under those limits.
   */
  limits?: Record<string, number>;
  skip?: CaseSkip;
} & (
  | ({ checks?: undefined } & PortedCheck)
  | { checks: PortedCheck[]; source?: undefined }
);

export function checksOf(c: PortedCase): PortedCheck[] {
  if (c.checks) return c.checks;
  const {
    name: _name,
    fixture: _fixture,
    flags: _flags,
    shareFixture: _shared,
    limits: _limits,
    skip: _skip,
    checks: _checks,
    ...check
  } = c;
  return [check];
}

// ---------------------------------------------------------------------------
// The area switch
// ---------------------------------------------------------------------------

/**
 * The upstream files whose type assertions run. Each file's area is turned
 * on by the checker slice that implements it; until then its cases check that
 * their snippets parse, then report as skipped.
 */
export const CHECKED_AREAS: readonly string[] = [
  "TypeInfer.primitives.test.cpp",
  "TypeInfer.const.test.cpp",
  "TypeInfer.negations.test.cpp",
  "TypeInfer.anyerror.test.cpp",
  "TypeInfer.unknownnever.test.cpp",
  "TypeInfer.singletons.test.cpp",
  "TypeInfer.annotations.test.cpp",
];

/**
 * `LUAU_TYPECHECK_AREAS=all`, or a comma-separated list of upstream files,
 * turns areas on without editing `CHECKED_AREAS`.
 */
export function areaIsChecked(
  file: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const forced =
    env["LUAU_TYPECHECK_AREAS"]?.split(",").map((f) => f.trim()) ?? [];
  return (
    forced.includes("all") ||
    forced.includes(file) ||
    CHECKED_AREAS.includes(file)
  );
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
  divergenceCache ??= readFileSync(
    join(HERE, "..", "..", "..", "..", "docs", "runtime", "DIVERGENCES.md"),
    "utf8",
  )
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

// The keys of every member of a union.
type KeysOf<T> = T extends unknown ? keyof T : never;

// A type's keys, written out as an object so that the compiler rejects a list
// that leaves one out or names one the type lacks.
function keyList<T>(keys: Record<KeysOf<T>, true>): string[] {
  return Object.keys(keys);
}

const ASSERTION_KEYS = {
  errors: keyList<Extract<Assertion, { errors: unknown }>>({ errors: true }),
  error: keyList<Extract<Assertion, { error: unknown }>>({
    error: true,
    code: true,
    message: true,
    messageContains: true,
    messageExcludes: true,
    location: true,
    line: true,
    endLine: true,
    fields: true,
    fieldOptions: true,
    fieldLocations: true,
    moduleMatchesCheck: true,
  }),
  anyError: keyList<Extract<Assertion, { anyError: unknown }>>({
    anyError: true,
  }),
  noError: keyList<Extract<Assertion, { noError: unknown }>>({ noError: true }),
  everyError: keyList<Extract<Assertion, { everyError: unknown }>>({
    everyError: true,
  }),
  decoratedSource: keyList<Extract<Assertion, { decoratedSource: unknown }>>({
    decoratedSource: true,
  }),
  scopes: keyList<Extract<Assertion, { scopes: unknown }>>({ scopes: true }),
  type: keyList<Extract<Assertion, TypeSelector>>({
    type: true,
    global: true,
    alias: true,
    exportedAlias: true,
    importedAlias: true,
    builtin: true,
    overloadAt: true,
    diagnosticType: true,
    typeAt: true,
    expectedTypeAt: true,
    moduleReturn: true,
    path: true,
    module: true,
    normalized: true,
    equals: true,
    notEquals: true,
    options: true,
    kind: true,
    sameAs: true,
    notSameAs: true,
    printedSameAs: true,
    subtypeOf: true,
    isSubtype: true,
    results: true,
    typeParameters: true,
    properties: true,
    arguments: true,
    returns: true,
    hasSelf: true,
    polarity: true,
    instantiatedTypeParameters: true,
    instantiatedTypePackParameters: true,
    generics: true,
    genericPacks: true,
    name: true,
    definitionLocation: true,
    hasProperty: true,
    propertyLocations: true,
  }),
};

const PATH_STEPS = keyList<TypePathStep>({
  property: true,
  argument: true,
  result: true,
  indexer: true,
  typeParameter: true,
  generic: true,
  genericPack: true,
  instantiatedTypeParameter: true,
  instantiatedTypePackParameter: true,
});

const TO_STRING_OPTIONS = keyList<LuauToStringOptions>({
  exhaustive: true,
  useLineBreaks: true,
  functionTypeArguments: true,
  hideTableKind: true,
  hideNamedFunctionTypeParameters: true,
  hideFunctionSelfArgument: true,
  hideTableAliasExpansions: true,
  useQuestionMarks: true,
  ignoreSyntheticName: true,
  maxTableLength: true,
  maxTypeLength: true,
});

function assertionShape(a: Assertion): keyof typeof ASSERTION_KEYS {
  if ("errors" in a) return "errors";
  if ("error" in a) return "error";
  if ("anyError" in a) return "anyError";
  if ("noError" in a) return "noError";
  if ("everyError" in a) return "everyError";
  if ("decoratedSource" in a) return "decoratedSource";
  if ("scopes" in a) return "scopes";
  return "type";
}

function selectorProblems(s: TypeSelector, where: string): string[] {
  if (!s || typeof s !== "object") return [`${where} must be a type selector`];
  const subjects = SUBJECT_KEYS.filter((k) => k in s);
  const problems: string[] = [];
  if (subjects.length !== 1)
    problems.push(
      `${where} names ${subjects.length} of type, alias, typeAt and moduleReturn; it needs exactly one`,
    );
  if ("moduleReturn" in s && s.moduleReturn !== true)
    problems.push(`${where} moduleReturn must be true`);
  for (const key of ["type", "global", "alias", "exportedAlias", "module"]) {
    const value = (s as unknown as Record<string, unknown>)[key];
    if (value !== undefined && (typeof value !== "string" || !value))
      problems.push(`${where} ${key} must be a nonempty string`);
  }
  for (const key of ["typeAt", "expectedTypeAt", "overloadAt"]) {
    const value = (s as unknown as Record<string, unknown>)[key];
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.length !== 2 || !value.every(nonnegative))
    )
      problems.push(`${where} ${key} must be a nonnegative position`);
  }
  if (
    "importedAlias" in s &&
    (!Array.isArray(s.importedAlias) ||
      s.importedAlias.length !== 2 ||
      !s.importedAlias.every((v) => typeof v === "string" && v.length))
  )
    problems.push(`${where} importedAlias must name an import and alias`);
  if (
    "diagnosticType" in s &&
    (!Array.isArray(s.diagnosticType) ||
      s.diagnosticType.length !== 2 ||
      !nonnegative(s.diagnosticType[0]) ||
      typeof s.diagnosticType[1] !== "string" ||
      !s.diagnosticType[1])
  )
    problems.push(`${where} diagnosticType must name an index and field`);
  if (
    "builtin" in s &&
    ![
      "number",
      "string",
      "boolean",
      "nil",
      "any",
      "unknown",
      "never",
      "function",
      "table",
    ].includes(s.builtin)
  )
    problems.push(`${where} builtin is unknown`);
  if (s.normalized !== undefined && s.normalized !== true)
    problems.push(`${where} normalized must be true`);
  if (s.path !== undefined && !Array.isArray(s.path))
    return [...problems, `${where} path must be an array`];
  for (const step of s.path ?? []) {
    if (!step || typeof step !== "object") {
      problems.push(`${where} has an invalid path step`);
      continue;
    }
    const keys = Object.keys(step);
    if (keys.length !== 1 || !PATH_STEPS.includes(keys[0]!)) {
      problems.push(
        `${where} has a path step ${JSON.stringify(step)} that is not one of ${PATH_STEPS.join(", ")}`,
      );
    } else {
      const key = keys[0]!,
        value = (step as unknown as Record<string, unknown>)[key];
      if (
        key === "property"
          ? typeof value !== "string" || !value
          : key === "indexer"
            ? !["key", "result"].includes(String(value))
            : !nonnegative(value)
      )
        problems.push(`${where} path step ${key} has an invalid value`);
    }
  }
  return problems;
}

const SUBJECT_KEYS = [
  "type",
  "global",
  "alias",
  "typeAt",
  "expectedTypeAt",
  "moduleReturn",
  "exportedAlias",
  "importedAlias",
  "builtin",
  "overloadAt",
  "diagnosticType",
];
const SELECTOR_KEYS = [...SUBJECT_KEYS, "path", "module", "normalized"];
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function tuple(value: unknown): boolean {
  return Array.isArray(value) && value.length === 4 && value.every(nonnegative);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function optionProblems(options: unknown, where: string): string[] {
  if (!object(options)) return [`${where} must be toString options`];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(options))
    if (!TO_STRING_OPTIONS.includes(key))
      problems.push(`${where} has unknown option ${key}`);
    else if (
      key.startsWith("max") ? !nonnegative(value) : typeof value !== "boolean"
    )
      problems.push(`${where} option ${key} has invalid value`);
  return problems;
}

function assertionProblems(
  a: Assertion,
  where: string,
  errorKinds: ReadonlySet<string>,
): string[] {
  if (!a || typeof a !== "object") return [`${where} must be an assertion`];
  const problems: string[] = [];
  const shape = assertionShape(a);
  const unknown = Object.keys(a).filter(
    (key) => !ASSERTION_KEYS[shape].includes(key),
  );
  if (unknown.length)
    problems.push(
      `${where} has keys ${unknown.join(", ")} that a ${shape} assertion does not take`,
    );
  if ("error" in a && a.code !== undefined && !errorKinds.has(a.code))
    problems.push(`${where} names ${a.code}, which is not a Luau error kind`);
  if ("anyError" in a && !errorKinds.has(a.anyError))
    problems.push(
      `${where} names ${a.anyError}, which is not a Luau error kind`,
    );
  if ("noError" in a && !errorKinds.has(a.noError))
    problems.push(
      `${where} names ${a.noError}, which is not a Luau error kind`,
    );
  if ("decoratedSource" in a && typeof a.decoratedSource !== "string")
    problems.push(`${where} decoratedSource must be a string`);
  if (
    "everyError" in a &&
    (!object(a.everyError) ||
      !Object.keys(a.everyError).length ||
      Object.keys(a.everyError).some(
        (k) => !["line", "messageExcludes"].includes(k),
      ) ||
      (a.everyError.line !== undefined && !nonnegative(a.everyError.line)) ||
      (a.everyError.messageExcludes !== undefined &&
        typeof a.everyError.messageExcludes !== "string"))
  ) {
    problems.push(
      `${where} everyError must contain only a nonnegative integer line`,
    );
  }
  if (shape === "type") {
    const t = a as Extract<Assertion, TypeSelector>;
    problems.push(...selectorProblems(t, where));
    if (t.sameAs)
      problems.push(...selectorProblems(t.sameAs, `${where} sameAs`));
    for (const key of ["sameAs", "notSameAs", "printedSameAs"] as const) {
      const selector = t[key];
      if (selector === undefined) continue;
      if (key !== "sameAs")
        problems.push(...selectorProblems(selector, `${where} ${key}`));
      if (object(selector)) {
        const unknown = Object.keys(selector).filter(
          (k) => !SELECTOR_KEYS.includes(k),
        );
        if (unknown.length)
          problems.push(
            `${where} ${key} has non-selector keys ${unknown.join(", ")}`,
          );
      }
    }
    if (t.subtypeOf !== undefined) {
      problems.push(...selectorProblems(t.subtypeOf, `${where} subtypeOf`));
      if (t.subtypeOf && typeof t.subtypeOf === "object") {
        const extra = Object.keys(t.subtypeOf).filter(
          (k) => !SELECTOR_KEYS.includes(k),
        );
        if (extra.length)
          problems.push(
            `${where} subtypeOf has non-selector keys ${extra.join(", ")}`,
          );
      }
    }
    if (t.subtypeOf !== undefined && typeof t.isSubtype !== "boolean")
      problems.push(`${where} subtypeOf needs a boolean isSubtype`);
    if (t.isSubtype !== undefined && t.subtypeOf === undefined)
      problems.push(`${where} isSubtype needs a subtypeOf selector`);
    if (
      t.kind !== undefined &&
      ![
        ...LUAU_TYPE_KINDS,
        "TypePack",
        "VariadicTypePack",
        "GenericTypePack",
        "FreeTypePack",
        "BoundTypePack",
        "ErrorTypePack",
      ].includes(t.kind)
    )
      problems.push(`${where} names ${t.kind}, which is not a Luau type class`);
    const badOptions = Object.keys(t.options ?? {}).filter(
      (o) => !TO_STRING_OPTIONS.includes(o),
    );
    if (badOptions.length)
      problems.push(
        `${where} has toString options ${badOptions.join(", ")} that Luau does not have`,
      );
    if (
      t.options &&
      t.equals === undefined &&
      t.notEquals === undefined &&
      t.printedSameAs === undefined
    )
      problems.push(
        `${where} has toString options but nothing printed to compare`,
      );
    if (t.options && object(t.options))
      for (const [key, value] of Object.entries(t.options))
        if (
          TO_STRING_OPTIONS.includes(key) &&
          (key.startsWith("max")
            ? !nonnegative(value)
            : typeof value !== "boolean")
        )
          problems.push(`${where} option ${key} has invalid value`);
    for (const key of [
      "typeParameters",
      "properties",
      "instantiatedTypeParameters",
      "instantiatedTypePackParameters",
      "generics",
      "genericPacks",
    ] as const)
      if (t[key] !== undefined && !nonnegative(t[key]))
        problems.push(`${where} ${key} must be a nonnegative integer`);
    for (const key of ["equals", "notEquals", "name"] as const)
      if (t[key] !== undefined && typeof t[key] !== "string")
        problems.push(`${where} ${key} must be a string`);
    if (t.hasSelf !== undefined && typeof t.hasSelf !== "boolean")
      problems.push(`${where} hasSelf must be boolean`);
    if (
      t.polarity !== undefined &&
      !["Mixed", "Positive", "Negative", "Unknown"].includes(t.polarity)
    )
      problems.push(`${where} polarity is unknown`);
    for (const key of ["arguments", "returns"] as const) {
      const value = t[key];
      if (value === undefined) continue;
      if (
        !object(value) ||
        !Object.keys(value).length ||
        Object.keys(value).some(
          (k) => !["length", "tail", "tailKind"].includes(k),
        ) ||
        (value.length !== undefined && !nonnegative(value.length)) ||
        (value.tail !== undefined && typeof value.tail !== "boolean") ||
        (value.tailKind !== undefined &&
          ![
            "TypePack",
            "VariadicTypePack",
            "GenericTypePack",
            "FreeTypePack",
            "ErrorTypePack",
            "BlockedTypePack",
            "BoundTypePack",
          ].includes(value.tailKind))
      )
        problems.push(
          `${where} ${key} must contain a head length or tail presence`,
        );
    }
    if (t.definitionLocation !== undefined && !tuple(t.definitionLocation))
      problems.push(`${where} definitionLocation must be a location`);
    if (
      t.hasProperty !== undefined &&
      (!Array.isArray(t.hasProperty) ||
        !t.hasProperty.every((v) => typeof v === "string" && v.length))
    )
      problems.push(`${where} hasProperty must list names`);
    if (t.propertyLocations !== undefined) {
      if (!object(t.propertyLocations))
        problems.push(`${where} propertyLocations must map names to locations`);
      else
        for (const [name, properties] of Object.entries(t.propertyLocations))
          if (
            !name ||
            !object(properties) ||
            !Object.keys(properties).length ||
            Object.entries(properties).some(
              ([key, value]) =>
                !["location", "typeLocation"].includes(key) ||
                (value !== null && !tuple(value)),
            )
          )
            problems.push(`${where} property ${name} has invalid locations`);
    }
  }
  if ("error" in a) {
    for (const key of ["error", "line", "endLine"] as const)
      if (a[key] !== undefined && !nonnegative(a[key]))
        problems.push(`${where} ${key} must be a nonnegative integer`);
    for (const key of ["messageContains", "messageExcludes"] as const)
      if (a[key] !== undefined && typeof a[key] !== "string")
        problems.push(`${where} ${key} must be a string`);
    if (a.moduleMatchesCheck !== undefined && a.moduleMatchesCheck !== true)
      problems.push(`${where} moduleMatchesCheck must be true`);
    if (a.fieldOptions !== undefined) {
      if (!object(a.fieldOptions))
        problems.push(`${where} fieldOptions must map type fields to options`);
      else
        for (const [field, options] of Object.entries(a.fieldOptions)) {
          problems.push(...optionProblems(options, `${where} field ${field}`));
          if (!a.fields || !(field in a.fields))
            problems.push(
              `${where} fieldOptions ${field} has no field expectation`,
            );
        }
    }
    if (a.fieldLocations !== undefined) {
      if (!object(a.fieldLocations))
        problems.push(`${where} fieldLocations must map fields to facts`);
      else
        for (const [field, facts] of Object.entries(a.fieldLocations))
          if (
            !field ||
            !object(facts) ||
            !Object.keys(facts).length ||
            Object.keys(facts).some((k) => !["present", "line"].includes(k)) ||
            (facts.present !== undefined &&
              typeof facts.present !== "boolean") ||
            (facts.line !== undefined && !nonnegative(facts.line))
          )
            problems.push(`${where} field ${field} has invalid location facts`);
    }
  }
  if ("scopes" in a) {
    if (
      !object(a.scopes) ||
      !Object.keys(a.scopes).length ||
      (a.scopes.minimum !== undefined && !nonnegative(a.scopes.minimum)) ||
      (a.scopes.count !== undefined && !nonnegative(a.scopes.count)) ||
      Object.keys(a.scopes).some(
        (k) => !["minimum", "count", "aliases", "importedModules"].includes(k),
      )
    )
      problems.push(`${where} scopes must have a nonnegative minimum`);
    if (
      a.scopes?.importedModules !== undefined &&
      (!Array.isArray(a.scopes.importedModules) ||
        a.scopes.importedModules.some(
          (f) =>
            !object(f) ||
            Object.keys(f).some(
              (k) => !["scope", "name", "module"].includes(k),
            ) ||
            !nonnegative(f.scope) ||
            typeof f.name !== "string" ||
            !f.name ||
            typeof f.module !== "string" ||
            !f.module,
        ))
    )
      problems.push(`${where} scopes importedModules has invalid binding`);
    if (a.scopes?.aliases !== undefined) {
      if (!Array.isArray(a.scopes.aliases))
        problems.push(`${where} scopes aliases must be an array`);
      else
        for (const fact of a.scopes.aliases)
          if (
            !object(fact) ||
            Object.keys(fact).some(
              (k) => !["scope", "scopeAt", "name", "location"].includes(k),
            ) ||
            typeof fact.name !== "string" ||
            !fact.name ||
            !tuple(fact.location) ||
            Number("scope" in fact) + Number("scopeAt" in fact) !== 1 ||
            (fact.scope !== undefined && !nonnegative(fact.scope)) ||
            (fact.scopeAt !== undefined &&
              (!Array.isArray(fact.scopeAt) ||
                fact.scopeAt.length !== 2 ||
                !fact.scopeAt.every(nonnegative)))
          )
            problems.push(
              `${where} scopes alias has invalid selector or location`,
            );
    }
  }
  return problems;
}

function checkProblems(
  check: PortedCheck,
  where: string,
  errorKinds: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  if (typeof check.source !== "string") problems.push(`${where} has no source`);
  if (
    check.definitions !== undefined &&
    (!Array.isArray(check.definitions) ||
      !check.definitions.every((v) => typeof v === "string"))
  )
    problems.push(`${where} definitions must be source strings`);
  for (const key of ["moduleSources", "globals"] as const) {
    const value = check[key];
    if (
      value !== undefined &&
      (!object(value) ||
        Object.entries(value).some(
          ([name, source]) =>
            !name ||
            typeof source !== "string" ||
            (key === "globals" && !/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)),
        ))
    )
      problems.push(`${where} ${key} must map valid names to source strings`);
  }
  if (
    check.moduleSources &&
    object(check.moduleSources) &&
    (check.module ?? "MainModule") in check.moduleSources
  )
    problems.push(`${where} moduleSources duplicates its entry module`);
  if (check.hiddenTypes !== undefined && check.hiddenTypes !== true)
    problems.push(`${where} hiddenTypes must be true`);
  if (
    check.retainFullTypeGraphs !== undefined &&
    check.retainFullTypeGraphs !== false
  )
    problems.push(`${where} retainFullTypeGraphs must be false`);
  if (check.clearModules !== undefined && check.clearModules !== true)
    problems.push(`${where} clearModules must be true`);
  if (
    check.unparsed &&
    "defect" in check.unparsed &&
    !(Number.isInteger(check.unparsed.defect) && check.unparsed.defect > 0)
  ) {
    problems.push(
      `${where} records an unparsed defect that is not an issue number`,
    );
  }
  if (
    check.unparsed &&
    "divergence" in check.unparsed &&
    !divergenceHeadings().includes(check.unparsed.divergence)
  ) {
    problems.push(
      `${where} names a divergence "${check.unparsed.divergence}" that is not a heading in DIVERGENCES.md`,
    );
  }
  if (check.malformed !== undefined && !check.malformed)
    problems.push(`${where} has an empty malformed reason`);
  if (check.malformed && check.unparsed)
    problems.push(`${where} is recorded as both malformed and unparsed`);
  if (check.module !== undefined && !check.module)
    problems.push(`${where} has an empty module name`);
  if (check.notApplicable !== undefined && !check.notApplicable)
    problems.push(`${where} has an empty not-applicable reason`);
  check.expect.forEach((a, j) =>
    problems.push(
      ...assertionProblems(a, `${where} assertion ${j}`, errorKinds),
    ),
  );
  return problems;
}

/** Everything wrong with a ported file, compared with the manifest's entry for its upstream file. */
export function portProblems(
  file: string,
  cases: PortedCase[],
  manifest: Manifest,
): string[] {
  const problems: string[] = [];
  const upstream = manifest.files[file];
  if (!upstream) return [`${file} is not in upstream/typecheck-cases.json`];

  const names = cases.map((c) => c.name);
  const expected = upstream.map((c) => c.name);
  const missing = expected.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !expected.includes(n));
  if (missing.length)
    problems.push(`missing upstream cases: ${missing.join(", ")}`);
  if (extra.length)
    problems.push(`cases not in ${file} upstream: ${extra.join(", ")}`);
  if (
    !missing.length &&
    !extra.length &&
    JSON.stringify(names) !== JSON.stringify(expected)
  ) {
    problems.push(
      "the cases are not in upstream order, or a repeated name is ported a different number of times",
    );
  }

  const errorKinds = new Set(manifest.errorKinds);
  cases.forEach((c, i) => {
    const where = `case ${c.name}`;
    const up = upstream[i];
    if (up && up.name === c.name)
      problems.push(...upstreamProblems(c, up, where));
    const checks = checksOf(c);
    if (c.shareFixture !== undefined && c.shareFixture !== true)
      problems.push(`${where} shareFixture must be true`);
    if (checks.some((ch) => ch.clearModules) && !c.shareFixture)
      problems.push(`${where} clearModules needs shareFixture`);
    if (
      c.flags !== undefined &&
      (!object(c.flags) ||
        Object.entries(c.flags).some(
          ([name, value]) => !name || typeof value !== "boolean",
        ))
    )
      problems.push(`${where} flags must map names to booleans`);
    if (!checks.length && !c.skip)
      problems.push(`${where} has no checks and no skip`);
    if (c.skip && "newSolver" in c.skip && !c.skip.newSolver)
      problems.push(`${where} has an empty new-solver reason`);
    if (c.skip && "notApplicable" in c.skip && !c.skip.notApplicable)
      problems.push(`${where} has an empty not-applicable reason`);
    for (const [limit, value] of Object.entries(c.limits ?? {})) {
      if (!Number.isInteger(value))
        problems.push(
          `${where} sets the limit ${limit} to ${value}, which is not an integer`,
        );
    }
    checks.forEach((check, k) =>
      problems.push(
        ...checkProblems(
          check,
          checks.length > 1 ? `${where} check ${k}` : where,
          errorKinds,
        ),
      ),
    );
  });
  return problems;
}

// How a case must be marked, given what upstream says about it.
function upstreamProblems(
  c: PortedCase,
  up: ManifestCase,
  where: string,
): string[] {
  const problems: string[] = [];
  if (up.fixture !== c.fixture) {
    problems.push(
      `${where} has fixture ${c.fixture ?? "(none)"}, upstream ${up.fixture ?? "(none)"}`,
    );
  }
  const guarded = Boolean(
    c.skip &&
      "newSolver" in c.skip &&
      c.skip.newSolver === NEW_SOLVER_GUARD_REASON,
  );
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
 * is on, or `skip` otherwise. `check` compiles a snippet; tests give a
 * stand-in.
 */
export function runPortedCase(
  file: string,
  c: PortedCase,
  skip: () => void,
  check: typeof checkLuau = checkLuau,
): void {
  const checks = checksOf(c);
  const session = c.shareFixture ? createLuauCheckSession() : undefined;
  const results = checks.map((ch) => ({
    check: ch,
    result: check(ch.source, {
      mode: ch.mode,
      fixture: ch.fixture ?? c.fixture,
      ...(ch.module === undefined ? {} : { module: ch.module }),
      ...(ch.definitions === undefined ? {} : { definitions: ch.definitions }),
      ...(ch.globals === undefined ? {} : { globals: ch.globals }),
      ...(ch.moduleSources === undefined
        ? {}
        : { moduleSources: ch.moduleSources }),
      ...(ch.hiddenTypes ? { hiddenTypes: ch.hiddenTypes } : {}),
      ...(ch.retainFullTypeGraphs === false
        ? { retainFullTypeGraphs: false }
        : {}),
      ...(ch.clearModules ? { clearModules: ch.clearModules } : {}),
      ...(session ? { session } : {}),
      ...(c.flags &&
      !c.skip &&
      !ch.notApplicable &&
      !ch.doesNotPassNewSolver &&
      areaIsChecked(file)
        ? { flags: c.flags }
        : {}),
    }),
  }));

  // A snippet recorded as unparsed must still fail to parse, so the record
  // goes as soon as the defect is fixed or the divergence removed. A snippet
  // Luau rejects must be rejected here too.
  for (const { check: ch, result } of results) {
    expect(
      (result.setupSyntaxDiagnostics ?? []).map(describeDiagnostic),
      "setup source did not parse",
    ).toEqual([]);
    if (ch.unparsed) {
      expect(
        result.syntaxDiagnostics.length,
        `the snippet now parses cleanly, so remove its record ${JSON.stringify(ch.unparsed)}`,
      ).toBeGreaterThan(0);
    } else if (ch.malformed) {
      expect(
        result.syntaxDiagnostics.length,
        `Luau rejects the snippet (${ch.malformed}), but Sparkdown reports nothing; remove its malformed record and expect the error from the checker`,
      ).toBeGreaterThan(0);
    } else {
      expect(
        result.syntaxDiagnostics.map(describeDiagnostic),
        "Sparkdown did not read the snippet as Luau",
      ).toEqual([]);
    }
  }

  if (c.skip || checks.some((ch) => ch.unparsed) || !areaIsChecked(file)) {
    skip();
    return;
  }
  if (c.limits) {
    const lowered = Object.entries(c.limits).map(
      ([limit, value]) => `${limit} to ${value}`,
    );
    throw new NotImplemented(
      `setting ${lowered.join(" and ")}, as upstream's ScopedFastInt does`,
    );
  }
  for (const { check: ch, result } of results) {
    if (ch.doesNotPassNewSolver || ch.notApplicable) continue;
    runAssertions(result, ch);
  }
}

/** Runs one check's assertions against its result, in order. */
export function runAssertions(
  result: LuauCheckResult,
  check: PortedCheck,
): void {
  if (!result.checked) {
    throw new NotImplemented(
      `the assertions on ${JSON.stringify(check.source.trim().split("\n")[0])}`,
    );
  }
  const all = check.ignoreMissingAnnotations
    ? result.diagnostics.filter((d) => d.code !== "TypeAnnotationRequired")
    : result.diagnostics;
  const listed = all.map(describeDiagnostic);
  for (const a of check.expect) {
    if ("errors" in a) {
      if (a.errors === "some")
        expect(all.length, "expected errors").toBeGreaterThan(0);
      else expect(listed, `expected ${a.errors} errors`).toHaveLength(a.errors);
    } else if ("error" in a) {
      const d = all[a.error];
      expect(
        d,
        `expected an error at index ${a.error}: ${JSON.stringify(listed)}`,
      ).toBeDefined();
      if (!d) continue;
      if (a.code !== undefined) expect(d.code).toBe(a.code);
      if (typeof a.message === "string") expect(d.message).toBe(a.message);
      else if (a.message) expect(a.message.oneOf).toContain(d.message);
      if (a.location)
        expect([d.line, d.column, d.endLine, d.endColumn]).toEqual(a.location);
      if (a.line !== undefined) expect(d.line).toBe(a.line);
      if (a.endLine !== undefined) expect(d.endLine).toBe(a.endLine);
      if (a.messageContains !== undefined)
        expect(d.message).toContain(a.messageContains);
      if (a.messageExcludes !== undefined)
        expect(d.message).not.toContain(a.messageExcludes);
      if (a.moduleMatchesCheck) expect(d.module).toBe(result.moduleName);
      if (a.fields)
        expect(
          a.fieldOptions ? d.fields?.(a.fieldOptions) : (d.data ?? {}),
        ).toMatchObject(a.fields);
      for (const [field, facts] of Object.entries(a.fieldLocations ?? {})) {
        const value = d.data?.[field] as
          | { begin?: { line: number } }
          | undefined;
        if (facts.present !== undefined)
          expect(value !== undefined).toBe(facts.present);
        if (facts.line !== undefined)
          expect(value?.begin?.line).toBe(facts.line);
      }
    } else if ("anyError" in a) {
      expect(all.map((d) => d.code)).toContain(a.anyError);
    } else if ("noError" in a) {
      expect(all.map((d) => d.code)).not.toContain(a.noError);
    } else if ("everyError" in a) {
      for (const d of all) {
        if (a.everyError.line !== undefined)
          expect(d.line, describeDiagnostic(d)).toBe(a.everyError.line);
        if (a.everyError.messageExcludes !== undefined)
          expect(d.message).not.toContain(a.everyError.messageExcludes);
      }
    } else if ("decoratedSource" in a) {
      expect(result.decoratedSource()).toBe(a.decoratedSource);
    } else if ("scopes" in a) {
      if (a.scopes.minimum !== undefined)
        expect(result.scopes?.length).toBeGreaterThanOrEqual(a.scopes.minimum);
      if (a.scopes.count !== undefined)
        expect(result.scopes?.length).toBe(a.scopes.count);
      for (const f of a.scopes.importedModules ?? [])
        expect(result.scopes?.[f.scope]?.imports[f.name]).toBe(f.module);
      for (const fact of a.scopes.aliases ?? []) {
        const scope =
          fact.scope !== undefined
            ? result.scopes?.[fact.scope]
            : scopeAtPosition(result, fact.scopeAt!);
        expect(scope?.aliases[fact.name]).toEqual(fact.location);
      }
    } else {
      const t = result.find(selectorOf(a));
      if (a.equals !== undefined) expect(t.print(a.options)).toBe(a.equals);
      if (a.notEquals !== undefined)
        expect(t.print(a.options)).not.toBe(a.notEquals);
      if (a.kind !== undefined) expect(t.kind).toBe(a.kind);
      if (a.sameAs)
        expect(
          t.is(result.find(selectorOf(a.sameAs))),
          `same type as ${JSON.stringify(a.sameAs)}`,
        ).toBe(true);
      if (a.notSameAs)
        expect(t.is(result.find(selectorOf(a.notSameAs)))).toBe(false);
      if (a.printedSameAs)
        expect(t.print(a.options)).toBe(
          result.find(selectorOf(a.printedSameAs)).print(a.options),
        );
      if (a.subtypeOf)
        expect(
          t.subtypeOf(result.find(selectorOf(a.subtypeOf))),
          `subtype of ${JSON.stringify(a.subtypeOf)}`,
        ).toBe(a.isSubtype);
      if (a.results)
        expect(t.results?.map((r) => r.print())).toEqual(a.results);
      if (a.typeParameters !== undefined)
        expect(t.typeParameterCount).toBe(a.typeParameters);
      if (a.properties !== undefined)
        expect(t.propertyCount).toBe(a.properties);
      if (a.arguments) expect(t.arguments).toMatchObject(a.arguments);
      if (a.returns) expect(t.returns).toMatchObject(a.returns);
      if (a.hasSelf !== undefined) expect(t.hasSelf).toBe(a.hasSelf);
      if (a.polarity !== undefined) expect(t.polarity).toBe(a.polarity);
      if (a.instantiatedTypeParameters !== undefined)
        expect(t.instantiatedTypeParameterCount).toBe(
          a.instantiatedTypeParameters,
        );
      if (a.instantiatedTypePackParameters !== undefined)
        expect(t.instantiatedTypePackParameterCount).toBe(
          a.instantiatedTypePackParameters,
        );
      if (a.generics !== undefined) expect(t.genericCount).toBe(a.generics);
      if (a.genericPacks !== undefined)
        expect(t.genericPackCount).toBe(a.genericPacks);
      if (a.name !== undefined) expect(t.name).toBe(a.name);
      if (a.definitionLocation !== undefined)
        expect(t.definitionLocation).toEqual(a.definitionLocation);
      for (const name of a.hasProperty ?? [])
        expect(t.propertyNames).toContain(name);
      if (a.propertyLocations)
        expect(t.propertyLocations).toMatchObject(a.propertyLocations);
    }
  }
}

// Only the selector of a type assertion goes to the checker.
function selectorOf(s: TypeSelector): TypeSelector {
  return Object.fromEntries(
    Object.entries(s).filter(([key]) => SELECTOR_KEYS.includes(key)),
  ) as TypeSelector;
}

export const COVERAGE_TEST = "the port covers every upstream case";

// Pinned AstQuery.cpp's findScopeAtPosition: choose an enclosing narrower
// scope, with the module scope as fallback even outside the source range.
function scopeAtPosition(result: LuauCheckResult, at: [number, number]) {
  let selected = result.scopes?.[0];
  const position = new Position(...at);
  const location = (tuple: LocationTuple) =>
    new Location(
      new Position(tuple[0], tuple[1]),
      new Position(tuple[2], tuple[3]),
    );
  for (const scope of result.scopes ?? []) {
    const candidate = location(scope.location);
    if (
      candidate.contains(position) &&
      (!selected || location(selected.location).encloses(candidate))
    )
      selected = scope;
  }
  return selected;
}

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
      expect(
        basename(testPath),
        "a port is named after its upstream file",
      ).toBe(file.replace(/\.cpp$/, ".ts"));
      expect(portProblems(file, cases, loadManifest())).toEqual([]);
    });
  });
}
