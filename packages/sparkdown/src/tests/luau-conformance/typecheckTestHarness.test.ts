// Tests for the harness that runs the port of Luau's type-checker tests
// (`typecheck/`): what counts as a syntax diagnostic and where one is placed,
// how a ported case runs, and what is checked about a port.

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TYPECHECK_TEST_FILES } from "../../../scripts/generateTypecheckCases.ts";
import {
  areaIsChecked,
  loadManifest,
  NEW_SOLVER_GUARD_REASON,
  portProblems,
  runAssertions,
  runPortedCase,
  type Manifest,
  type PortedCase,
  type PortedCheck,
} from "./typecheck/portedCases";
import {
  checkLuau,
  NotImplemented,
  type CheckedType,
  type LuauCheckResult,
  type LuauDiagnostic,
} from "./typecheckTestHarness";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("syntax diagnostics", () => {
  test("a snippet Sparkdown reads as Luau has none", () => {
    expect(checkLuau("\n  local x: number = 1\n  local y = x\n").syntaxDiagnostics).toEqual([]);
  });

  test("a directive line is read as the comment it is", () => {
    expect(checkLuau("--!strict\nlocal x = 1").syntaxDiagnostics).toEqual([]);
  });

  test("a line read as something other than Luau is reported where it starts, in the snippet's own lines and columns", () => {
    const [first] = checkLuau("local x = 1\n-> elsewhere\nlocal y = 2").syntaxDiagnostics;
    expect(first).toMatchObject({ line: 1, column: 0, code: "SyntaxError" });
    expect(first?.message).toMatch(/^Sparkdown read "->" as DivertMark, not Luau$/);
  });

  test("a construct the parser cannot finish is reported, once per place", () => {
    const found = checkLuau("\n\n    local x = 1 )\n").syntaxDiagnostics;
    expect(found.map((d) => [d.line, d.column, d.message])).toEqual([
      [2, 16, `Sparkdown ended the snippet's function before ")"`],
      [2, 16, `Sparkdown could not finish reading the Luau before ")"`],
    ]);
  });

  test("a snippet that closes its function early is reported at what follows", () => {
    expect(checkLuau("local x = 1\nend\nlocal y = 2").syntaxDiagnostics).toEqual([
      {
        line: 2,
        column: 0,
        endLine: 2,
        endColumn: 11,
        message: `Sparkdown ended the snippet's function before "local y = 2"`,
        code: "SyntaxError",
      },
    ]);
  });

  test("a validator diagnostic keeps Luau's wording", () => {
    const [first] = checkLuau('local s = "abc\nlocal t = 1').syntaxDiagnostics;
    expect(first).toEqual({
      line: 0,
      column: 10,
      endLine: 0,
      endColumn: 14,
      message: "Malformed string; did you forget to finish it?",
      code: "SyntaxError",
    });
  });
});

describe("checkLuau before the checker exists", () => {
  test("it reports the syntax diagnostics as the diagnostics, and every type query is not implemented", () => {
    const result = checkLuau("local x = 1 )");
    expect(result.checked).toBe(false);
    expect(result.diagnostics).toEqual(result.syntaxDiagnostics);
    expect(() => result.typeOf("x")).toThrow(NotImplemented);
    expect(() => result.find({ type: "x" })).toThrow(/^not implemented: .* needs the type checker \(#599\)$/);
  });

  test("a diagnostic the compiler only logs is kept with the result, not printed", () => {
    const warn = vi.spyOn(console, "warn");
    try {
      const result = checkLuau("local s = foo.bar");
      expect(result.compilerMessages).toContain("Cannot find item or path named `foo.bar`");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Running ported cases, with a stand-in for checkLuau
// ---------------------------------------------------------------------------

const FILE = "TypeInfer.primitives.test.cpp";
const SYNTAX_ERROR: LuauDiagnostic = { line: 0, column: 0, endLine: 0, endColumn: 1, message: "bad", code: "SyntaxError" };

function stub(overrides: Partial<LuauCheckResult> = {}): LuauCheckResult {
  return {
    syntaxDiagnostics: [],
    checked: false,
    diagnostics: [],
    typeOf: () => {
      throw new NotImplemented("typeOf");
    },
    find: () => {
      throw new NotImplemented("find");
    },
    compilerMessages: [],
    ...overrides,
  };
}

function run(c: PortedCase, result: LuauCheckResult | ((source: string) => LuauCheckResult)) {
  const skip = vi.fn();
  runPortedCase(FILE, c, skip, (source) => (typeof result === "function" ? result(source) : result));
  return skip;
}

describe("running a ported case", () => {
  test("a snippet with a syntax diagnostic fails its case", () => {
    const c: PortedCase = { name: "a", source: "x", expect: [] };
    expect(() => run(c, stub({ syntaxDiagnostics: [SYNTAX_ERROR] }))).toThrow(/Sparkdown did not read the snippet as Luau/);
  });

  test("a malformed snippet's syntax is not checked", () => {
    const c: PortedCase = { name: "a", source: "x", malformed: "an error on purpose", expect: [] };
    expect(() => run(c, stub({ syntaxDiagnostics: [SYNTAX_ERROR] }))).not.toThrow();
  });

  test("a snippet recorded as unparsed skips its case while it still fails to parse", () => {
    const c: PortedCase = { name: "a", source: "x", unparsed: { defect: 875 }, expect: [{ errors: 0 }] };
    expect(run(c, stub({ syntaxDiagnostics: [SYNTAX_ERROR] }))).toHaveBeenCalledOnce();
  });

  test("a snippet recorded as unparsed fails its case once it parses, so the record goes", () => {
    const c: PortedCase = { name: "a", source: "x", unparsed: { defect: 875 }, expect: [] };
    expect(() => run(c, stub())).toThrow(/the snippet now parses cleanly, so remove its record \{"defect":875\}/);
  });

  test("a skipped case still checks that its snippets parse, then skips", () => {
    const c: PortedCase = { name: "a", skip: { notApplicable: "a reason" }, source: "x", expect: [{ errors: 0 }] };
    expect(() => run(c, stub({ syntaxDiagnostics: [SYNTAX_ERROR] }))).toThrow(/did not read the snippet as Luau/);
    expect(run(c, stub())).toHaveBeenCalledOnce();
  });

  test("with its area off, a case checks only that its snippets parse", () => {
    const c: PortedCase = { name: "a", source: "x", expect: [{ type: "x", equals: "number" }] };
    expect(run(c, stub({ checked: true }))).not.toHaveBeenCalled();
  });

  test("with its area on, a case runs its assertions, which fail as not implemented before the checker exists", () => {
    vi.stubEnv("LUAU_TYPECHECK_AREAS", FILE);
    const c: PortedCase = { name: "a", source: "local x = 1", expect: [{ errors: 0 }] };
    expect(() => runPortedCase(FILE, c, vi.fn())).toThrow(NotImplemented);
  });

  test("with its area on, even a case upstream asserts nothing about needs the checker to run", () => {
    vi.stubEnv("LUAU_TYPECHECK_AREAS", "all");
    const c: PortedCase = { name: "a", source: "local x = 1", expect: [] };
    expect(() => runPortedCase(FILE, c, vi.fn())).toThrow(NotImplemented);
  });

  test("a check upstream runs on the old solver only is not asserted", () => {
    vi.stubEnv("LUAU_TYPECHECK_AREAS", "all");
    const c: PortedCase = {
      name: "a",
      checks: [
        { source: "x", expect: [{ errors: 0 }] },
        { source: "y", doesNotPassNewSolver: true, expect: [{ errors: 5 }] },
      ],
    };
    expect(() => run(c, stub({ checked: true }))).not.toThrow();
  });

  test("each check is compiled with its mode, and its own fixture or the case's", () => {
    const seen: unknown[] = [];
    const c: PortedCase = {
      name: "a",
      fixture: "BuiltinsFixture",
      checks: [
        { source: "x", mode: "nonstrict", expect: [] },
        { source: "y", fixture: "Fixture", expect: [] },
      ],
    };
    runPortedCase(FILE, c, vi.fn(), (source, options) => {
      seen.push([source, options]);
      return stub();
    });
    expect(seen).toEqual([
      ["x", { mode: "nonstrict", fixture: "BuiltinsFixture" }],
      ["y", { mode: undefined, fixture: "Fixture" }],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Assertions against a checked result
// ---------------------------------------------------------------------------

function diagnostic(code: string, message = code, data?: Record<string, unknown>): LuauDiagnostic {
  return { line: 2, column: 4, endLine: 2, endColumn: 9, message, code, ...(data ? { data } : {}) };
}

function checkedType(printed: string, more: Partial<CheckedType> = {}): CheckedType {
  const self: CheckedType = {
    print: (options) => (options?.exhaustive ? `exhaustive ${printed}` : printed),
    kind: "PrimitiveType",
    is: (other) => other === self,
    ...more,
  };
  return self;
}

function assertOn(result: Partial<LuauCheckResult>, expectations: PortedCheck["expect"], more: Partial<PortedCheck> = {}) {
  return () => runAssertions(stub({ checked: true, ...result }), { source: "", expect: expectations, ...more });
}

describe("assertions", () => {
  const two = { diagnostics: [diagnostic("TypeMismatch", "first", { wantedType: "number" }), diagnostic("UnknownSymbol", "second")] };

  test("an error count, or some errors", () => {
    expect(assertOn(two, [{ errors: 2 }, { errors: "some" }])).not.toThrow();
    expect(assertOn(two, [{ errors: 1 }])).toThrow(/expected 1 errors/);
    expect(assertOn({ diagnostics: [] }, [{ errors: "some" }])).toThrow(/expected errors/);
  });

  test("an error's kind, message, location, line and fields", () => {
    expect(
      assertOn(two, [
        { error: 0, code: "TypeMismatch", message: "first", location: [2, 4, 2, 9], line: 2, fields: { wantedType: "number" } },
        { error: 1, message: { oneOf: ["other", "second"] } },
      ]),
    ).not.toThrow();
    expect(assertOn(two, [{ error: 0, code: "UnknownSymbol" }])).toThrow();
    expect(assertOn(two, [{ error: 0, message: "second" }])).toThrow();
    expect(assertOn(two, [{ error: 1, message: { oneOf: ["first"] } }])).toThrow();
    expect(assertOn(two, [{ error: 0, location: [2, 4, 2, 8] }])).toThrow();
    expect(assertOn(two, [{ error: 0, line: 3 }])).toThrow();
    expect(assertOn(two, [{ error: 0, fields: { wantedType: "string" } }])).toThrow();
    expect(assertOn(two, [{ error: 2 }])).toThrow(/expected an error at index 2/);
  });

  test("an error of a kind somewhere, or none", () => {
    expect(assertOn(two, [{ anyError: "UnknownSymbol" }, { noError: "SyntaxError" }])).not.toThrow();
    expect(assertOn(two, [{ anyError: "SyntaxError" }])).toThrow();
    expect(assertOn(two, [{ noError: "TypeMismatch" }])).toThrow();
  });

  test("missing-annotation errors are dropped before counting and indexing when upstream ignores them", () => {
    const result = { diagnostics: [diagnostic("TypeAnnotationRequired"), diagnostic("TypeMismatch")] };
    expect(assertOn(result, [{ errors: 1 }, { error: 0, code: "TypeMismatch" }], { ignoreMissingAnnotations: true })).not.toThrow();
    expect(assertOn(result, [{ errors: 1 }])).toThrow();
  });

  test("a type's printed text with its options, its class, its identity, its results and its type parameters", () => {
    const number = checkedType("number");
    const alias = checkedType("{ [number]: T }", { kind: "TableType", typeParameterCount: 1 });
    const fn = checkedType("() -> number", { kind: "FunctionType", results: [number] });
    const selected: unknown[] = [];
    const find: LuauCheckResult["find"] = (selector) => {
      selected.push(selector);
      if ("alias" in selector) return alias;
      if ("typeAt" in selector) return number;
      return selector.type === "f" ? fn : number;
    };
    expect(
      assertOn({ find }, [
        { type: "x", equals: "number", kind: "PrimitiveType" },
        { type: "x", options: { exhaustive: true }, equals: "exhaustive number" },
        { type: "x", sameAs: { typeAt: [1, 2] } },
        { type: "f", results: ["number"] },
        { alias: "Array", path: [{ indexer: "result" }], typeParameters: 1 },
      ]),
    ).not.toThrow();
    expect(selected).toEqual([
      { type: "x" },
      { type: "x" },
      { type: "x" },
      { typeAt: [1, 2] },
      { type: "f" },
      { alias: "Array", path: [{ indexer: "result" }] },
    ]);
    expect(assertOn({ find }, [{ type: "x", equals: "string" }])).toThrow();
    expect(assertOn({ find }, [{ type: "x", kind: "TableType" }])).toThrow();
    expect(assertOn({ find }, [{ type: "x", sameAs: { alias: "Array" } }])).toThrow(/same type as/);
    expect(assertOn({ find }, [{ type: "f", results: ["string"] }])).toThrow();
    expect(assertOn({ find }, [{ alias: "Array", typeParameters: 2 }])).toThrow();
  });
});

describe("the area switch", () => {
  test("an area is on when the environment names it, or names all", () => {
    expect(areaIsChecked("Nowhere.test.cpp", {})).toBe(false);
    expect(areaIsChecked("Nowhere.test.cpp", { LUAU_TYPECHECK_AREAS: "all" })).toBe(true);
    expect(areaIsChecked("Nowhere.test.cpp", { LUAU_TYPECHECK_AREAS: "A.test.cpp, Nowhere.test.cpp" })).toBe(true);
    expect(areaIsChecked("Nowhere.test.cpp", { LUAU_TYPECHECK_AREAS: "A.test.cpp" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Checking a port against the manifest
// ---------------------------------------------------------------------------

const MANIFEST: Manifest = {
  pin: "0".repeat(40),
  errorKinds: ["TypeMismatch", "SyntaxError"],
  files: {
    "X.test.cpp": [
      { name: "a", fixture: "Fixture" },
      { name: "b", fixture: "BuiltinsFixture", doesNotPassNewSolver: true },
      { name: "c" },
      { name: "d", fixture: "Fixture", doesNotPassNewSolver: "partly" },
      { name: "e", fixture: "Fixture", disabledUpstream: "#if 0" },
    ],
    "Y.test.cpp": [{ name: "same" }, { name: "same" }],
  },
};

const FAITHFUL: PortedCase[] = [
  { name: "a", fixture: "Fixture", source: "local x = 1", expect: [{ errors: 0 }] },
  { name: "b", fixture: "BuiltinsFixture", skip: { newSolver: NEW_SOLVER_GUARD_REASON }, source: "local y = 2", expect: [] },
  { name: "c", checks: [{ fixture: "BuiltinsFixture", source: "local z = 3", expect: [] }] },
  {
    name: "d",
    fixture: "Fixture",
    checks: [
      { source: "local p = 1", expect: [] },
      { source: "local q = 2", doesNotPassNewSolver: true, expect: [] },
    ],
  },
  { name: "e", fixture: "Fixture", skip: { disabledUpstream: true }, source: "local r = 1", expect: [] },
];

function withCase(index: number, replacement: PortedCase): PortedCase[] {
  return FAITHFUL.map((c, i) => (i === index ? replacement : c));
}

describe("checking a port against the manifest", () => {
  test("a faithful port has no problems", () => {
    expect(portProblems("X.test.cpp", FAITHFUL, MANIFEST)).toEqual([]);
  });

  test("an upstream file the manifest does not list is named", () => {
    expect(portProblems("Z.test.cpp", [], MANIFEST)).toEqual(["Z.test.cpp is not in upstream/typecheck-cases.json"]);
  });

  test("a missing case, a case upstream lacks, and cases out of order are each named", () => {
    expect(portProblems("X.test.cpp", FAITHFUL.slice(1), MANIFEST)).toContain("missing upstream cases: a");
    expect(portProblems("X.test.cpp", [...FAITHFUL, { name: "f", source: "", expect: [] }], MANIFEST)).toContain(
      "cases not in X.test.cpp upstream: f",
    );
    expect(portProblems("X.test.cpp", [FAITHFUL[1]!, FAITHFUL[0]!, ...FAITHFUL.slice(2)], MANIFEST)).toContain(
      "the cases are not in upstream order, or a repeated name is ported a different number of times",
    );
  });

  test("a name upstream repeats must be ported as many times", () => {
    const once: PortedCase[] = [{ name: "same", source: "", expect: [] }];
    expect(portProblems("Y.test.cpp", once, MANIFEST)).toEqual([
      "the cases are not in upstream order, or a repeated name is ported a different number of times",
    ]);
    expect(portProblems("Y.test.cpp", [...once, ...once], MANIFEST)).toEqual([]);
  });

  test("a fixture that differs from upstream is named", () => {
    expect(portProblems("X.test.cpp", withCase(0, { ...FAITHFUL[0]!, fixture: "BuiltinsFixture" } as PortedCase), MANIFEST)).toEqual([
      "case a has fixture BuiltinsFixture, upstream Fixture",
    ]);
  });

  test("the new-solver guard must match upstream, both ways", () => {
    expect(portProblems("X.test.cpp", withCase(1, { name: "b", fixture: "BuiltinsFixture", source: "", expect: [] }), MANIFEST)).toEqual([
      "case b is under DOES_NOT_PASS_NEW_SOLVER_GUARD upstream; skip it with { newSolver: NEW_SOLVER_GUARD_REASON }",
    ]);
    expect(
      portProblems("X.test.cpp", withCase(0, { ...FAITHFUL[0]!, skip: { newSolver: NEW_SOLVER_GUARD_REASON } } as PortedCase), MANIFEST),
    ).toEqual(["case a is skipped with the new-solver guard's reason, but upstream has no guard over the whole case"]);
  });

  test("a case upstream guards in part must mark those checks, both ways", () => {
    expect(
      portProblems("X.test.cpp", withCase(3, { name: "d", fixture: "Fixture", source: "", expect: [] }), MANIFEST),
    ).toEqual(["case d guards some of its checks upstream; mark those checks doesNotPassNewSolver"]);
    expect(
      portProblems("X.test.cpp", withCase(0, { ...FAITHFUL[0]!, doesNotPassNewSolver: true } as PortedCase), MANIFEST),
    ).toEqual(["case a marks a check doesNotPassNewSolver, but upstream guards no block within the case"]);
  });

  test("a case disabled upstream must be skipped as such, both ways", () => {
    expect(portProblems("X.test.cpp", withCase(4, { name: "e", fixture: "Fixture", source: "", expect: [] }), MANIFEST)).toEqual([
      "case e is disabled upstream (#if 0); skip it with { disabledUpstream: true }",
    ]);
    expect(
      portProblems("X.test.cpp", withCase(0, { ...FAITHFUL[0]!, skip: { disabledUpstream: true } } as PortedCase), MANIFEST),
    ).toEqual(["case a is skipped as disabled upstream, but upstream compiles it"]);
  });

  test("a case needs a check or a skip, and a skip needs its reason", () => {
    expect(portProblems("X.test.cpp", withCase(0, { name: "a", fixture: "Fixture", checks: [] }), MANIFEST)).toEqual([
      "case a has no checks and no skip",
    ]);
    expect(
      portProblems("X.test.cpp", withCase(0, { ...FAITHFUL[0]!, skip: { notApplicable: "" } } as PortedCase), MANIFEST),
    ).toEqual(["case a has an empty not-applicable reason"]);
  });

  test("each assertion is checked for its shape and for the names it uses", () => {
    const assertions = [
      { errors: 0, line: 1 },
      { error: 0, code: "TypeMissmatch" },
      { anyError: "Nope" },
      { noError: "Nope" },
      { type: "x", kind: "FunctionTyp" },
      { type: "x", alias: "y" },
      { type: "x", path: [{ field: "a" }] },
      { type: "x", options: { exhaustiv: true }, equals: "number" },
      { type: "x", options: { exhaustive: true } },
      { type: "x", sameAs: {} },
    ] as unknown as PortedCheck["expect"];
    expect(portProblems("X.test.cpp", withCase(0, { name: "a", fixture: "Fixture", source: "", expect: assertions }), MANIFEST)).toEqual([
      "case a assertion 0 has keys line that a errors assertion does not take",
      "case a assertion 1 names TypeMissmatch, which is not a Luau error kind",
      "case a assertion 2 names Nope, which is not a Luau error kind",
      "case a assertion 3 names Nope, which is not a Luau error kind",
      "case a assertion 4 names FunctionTyp, which is not a Luau type class",
      "case a assertion 5 names 2 of type, alias and typeAt; it needs exactly one",
      'case a assertion 6 has a path step {"field":"a"} that is not one of property, argument, result, indexer, typeParameter',
      "case a assertion 7 has toString options exhaustiv that Luau does not have",
      "case a assertion 8 has toString options but nothing printed to compare",
      "case a assertion 9 sameAs names 0 of type, alias and typeAt; it needs exactly one",
    ]);
  });

  test("each check is checked for how its parse is recorded", () => {
    const checks = [
      { source: "", malformed: "", expect: [] },
      { source: "", malformed: "an error", unparsed: { defect: 875 }, expect: [] },
      { source: "", unparsed: { defect: 0 }, expect: [] },
      { source: "", unparsed: { divergence: "Not a section" }, expect: [] },
      { source: "", unparsed: { divergence: "Type annotations are parsed but ignored" }, expect: [] },
      { source: "", module: "", expect: [] },
    ] as PortedCheck[];
    expect(portProblems("X.test.cpp", withCase(0, { name: "a", fixture: "Fixture", checks }), MANIFEST)).toEqual([
      "case a check 0 is malformed with no description of its syntax error",
      "case a check 1 is both malformed and unparsed; the parse check skips a malformed snippet",
      "case a check 2 records an unparsed defect that is not an issue number",
      'case a check 3 names a divergence "Not a section" that is not a heading in DIVERGENCES.md',
      "case a check 5 has an empty module name",
    ]);
  });
});

describe("the manifest and the ported files", () => {
  const manifest = loadManifest();

  test("the manifest pins a commit and lists every type-checker file, each with its cases", () => {
    expect(manifest.pin).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(manifest.files)).toEqual(TYPECHECK_TEST_FILES);
    for (const cases of Object.values(manifest.files)) {
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) expect(c.name).toMatch(/\S/);
    }
    expect(manifest.errorKinds).toEqual(expect.arrayContaining(["SyntaxError", "TypeMismatch", "TypeAnnotationRequired"]));
  });

  test("every ported file is named after an upstream file in the manifest", () => {
    const here = join(dirname(fileURLToPath(import.meta.url)), "typecheck");
    const ports = readdirSync(here).filter((f) => f.endsWith(".test.ts"));
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) expect(Object.keys(manifest.files)).toContain(port.replace(/\.ts$/, ".cpp"));
  });
});
