import { describe, expect, test } from "vitest";
import type { TypeId } from "../../compiler/typecheck/Type";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { checkLuau, type LuauCheckSession } from "./typecheckTestHarness";
import {
  runAssertions,
  runPortedCase,
  portProblems,
  type PortedCase,
  type Assertion,
} from "./typecheck/portedCases";

describe("faithful fixture and query execution", () => {
  test.each([
    ["0x10", "16"],
    ["0b1010", "10"],
    ["1_000", "1000"],
    ["1e2", "100"],
    ["01.500", "1.5"],
    [".1", "0.10000000000000001"],
    ["1e-5", "1.0000000000000001e-05"],
    ["1e-4", "0.0001"],
    ["1e17", "1e+17"],
    ["2147483647.0", "2147483647"],
    ["2147483648.0", "2147483648"],
    ["9007199254740993", "9007199254740992"],
    ["5e-324", "4.9406564584124654e-324"],
    ["1e500", "1e500"],
    ["-0.0", "-0"],
    ["-1e2", "-100"],
    ["-0x10", "-16"],
    ["1846707753922048.25", "1846707753922048.2"],
    ["-2012579083280643.25", "-2012579083280643.2"],
    ["27057084435577.3125", "27057084435577.312"],
  ])(
    "decoration prints numeric AST value %s with pinned precision",
    (literal, printed) => {
      const r = checkLuau(`local x=${literal}`);
      expect(r.syntaxDiagnostics).toEqual([]);
      expect(r.diagnostics).toEqual([]);
      expect(r.decoratedSource()).toBe(`local x:number=${printed}`);
    },
  );
  // Exact outputs measured with the AST-only PrettyPrinter at the same pin.
  // Its separators are emitted before advancing to the next expression.
  test.each([
    ["return 0x0000000000000001,1e2", "return 1,                 100"],
    ["return .1, 0b10\n", "return 0.10000000000000001,2\n"],
    ["return -0.0,0x10", "return -0,  16  "],
    ["return {0b10,.1};", "return {2,   0.10000000000000001};"],
    ["return (01.500)", "return (1.5   )"],
    ["return math.abs(0x10)", "return math.abs(16)  "],
    ["return 0x10+1e2", "return 16 + 100"],
    ["return 0x10  +  1e2", "return 16 +     100"],
    ["return 0x10==1e2", "return 16 == 100"],
    ["return 0x10//1e2", "return 16 // 100"],
    ["return 0x10\n+1e2", "return 16+\n 100"],
    ["return -2147483648.0", "return -2147483648  "],
    ["return 1846707753922048.25", "return 1846707753922048.2 "],
  ])(
    "numeric decoration retains pinned positions for %s",
    (source, printed) => {
      const r = checkLuau(
        source,
        source.includes("math.abs")
          ? { globals: { math: "{abs:(number)->number}" } }
          : undefined,
      );
      expect(r.syntaxDiagnostics).toEqual([]);
      expect(r.diagnostics).toEqual([]);
      expect(r.decoratedSource()).toBe(printed);
    },
  );
  test("flattened pack facts preserve chained heads and the actual residual tail", () => {
    const r = checkLuau(
      "function take_two() return 2,2 end\nfunction take_three() return 1,take_two() end",
    );
    const f = r.find({ type: "take_three" });
    expect(f.returns).toMatchObject({
      length: 1,
      tail: true,
      tailKind: "TypePack",
    });
    expect(f.flattenedReturns).toMatchObject({ length: 3, tail: false });
    runAssertions(r, {
      source: "",
      expect: [
        { type: "take_three", flattenedReturns: { length: 3, tail: false } },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ type: "take_three", returns: { length: 3, tail: false } }],
      }),
    ).toThrow();
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [
          { type: "take_three", flattenedReturns: { length: 1, tail: true } },
        ],
      }),
    ).toThrow();
    const v = checkLuau(
      "local function f(a:number,...:string):(number,...string) return a,... end",
    ).find({ type: "f" });
    expect(v.flattenedArguments).toEqual({
      length: 1,
      tail: true,
      tailKind: "VariadicTypePack",
    });
    expect(v.flattenedReturns).toEqual({
      length: 1,
      tail: true,
      tailKind: "VariadicTypePack",
    });
    const m = checkLuau("return 1,2").find({ moduleReturn: true });
    expect(m.flattenedReturns).toEqual({
      length: 2,
      tail: false,
      tailKind: undefined,
    });
    expect(
      portProblems(
        "X.test.cpp",
        [
          {
            name: "a",
            source: "",
            expect: [
              {
                type: "take_three",
                flattenedReturns: { length: 3, tail: false },
              },
            ],
          },
        ],
        {
          pin: "test",
          errorKinds: [],
          files: { "X.test.cpp": [{ name: "a" }] },
        },
      ),
    ).toEqual([]);
  });
  test("decoration rehydrates singleton contents inside compound types", () => {
    const r = checkLuau("local x=foo", { globals: { foo: "'a, b'" } });
    expect(r.diagnostics).toHaveLength(0);
    expect(r.typeOf("x")).toBe('"a, b"');
    expect(r.decoratedSource()).toBe("local x:'a, b'=foo");
    const t = checkLuau("local x=foo", {
      globals: { foo: "{value: 'a, b | c -> d'}" },
    });
    expect(t.diagnostics).toHaveLength(0);
    expect(t.decoratedSource()).toBe("local x:{value:'a, b | c -> d'}=foo");
    expect(
      checkLuau("local x=foo", {
        globals: { foo: "(value:number)->'a, b'" },
      }).decoratedSource(),
    ).toBe("local x:(value:number)->('a, b')=foo");
    expect(
      checkLuau("local x:'a, b'=foo", {
        globals: { foo: "'a, b'" },
      }).decoratedSource(),
    ).toBe("local x:'a, b'=foo");
  });
  test("decoration follows pinned string quote selection and escaping", () => {
    expect(checkLuau('local x="it\'s"').decoratedSource()).toBe(
      'local x:string="it\\\'s"',
    );
    // The root block's final source position remains line1/column2 after the
    // multiline literal is escaped, as PrettyPrinter::visualizeBlock advances.
    expect(
      checkLuau('local x=[["quote", {value},\t\n]]').decoratedSource(),
    ).toBe("local x:string='\\\"quote\\\", \\123value},\\t\\n'\n  ");
    expect(
      checkLuau("local x=foo", {
        globals: { foo: '"it\\\'s"' },
      }).decoratedSource(),
    ).toBe('local x:"it\\\'s"=foo');
  });
  test("shared port steps assert before the next global setup transition", () => {
    runPortedCase(
      "TypeInfer.annotations.test.cpp",
      {
        name: "ordered setup",
        shareFixture: true,
        checks: [
          {
            source: "local x=sentinel",
            globals: { sentinel: "number" },
            expect: [{ global: "sentinel", equals: "number" }],
          },
          {
            source: "local x=sentinel",
            globals: { sentinel: "string" },
            clearModules: true,
            expect: [{ global: "sentinel", equals: "string" }],
          },
        ],
      },
      () => {
        throw new Error("applicable case skipped");
      },
    );
  });
  test("dependency errors retain module names, source order and reachability", () => {
    const r = checkLuau(
      "local Import=require(game.Types)\nlocal x:Import.T='bad'\nreturn x",
      {
        fixture: "BuiltinsFixture",
        module: "game/Main",
        moduleSources: {
          "game/Types":
            "export type T=number\nlocal a:number='s'\nlocal b:string=1\nreturn 1",
          "game/Unused": "local z:number='unused'\nreturn 1",
        },
      },
    );
    expect(r.setupSyntaxDiagnostics).toEqual([]);
    expect(r.find({ importedAlias: ["Import", "T"] }).print()).toBe("number");
    expect(r.diagnostics.map((d) => [d.module, d.line, d.code])).toEqual([
      ["game/Types", 1, "TypeMismatch"],
      ["game/Types", 2, "TypeMismatch"],
      ["game/Main", 1, "TypeMismatch"],
    ]);
    expect(r.find({ diagnosticType: [0, "givenType"] }).print()).toBe("string");
  });
  test("error builtin identity is accepted by port coverage validation", () => {
    const c: PortedCase = {
      name: "a",
      source: "local x=1",
      expect: [{ builtin: "error", equals: "*error-type*" }],
    };
    expect(
      portProblems("X.test.cpp", [c], {
        pin: "test",
        errorKinds: [],
        files: { "X.test.cpp": [{ name: "a" }] },
      }),
    ).toEqual([]);
  });
  test("recursive function result queries do not eagerly expand their cycle", () => {
    const r = checkLuau("local function f() return f end");
    const f = r.find({ type: "f" });
    expect(f.kind).toBe("FunctionType");
    expect(f.results?.[0]?.is(f)).toBe(true);
  });
  test("const parser and negation path flags use audited fixed behavior", () => {
    const r = checkLuau("const x=1\nx='s'", {
      flags: { LuauExportValueSyntax: true },
    });
    expect(r.diagnostics[0]?.data).toMatchObject({
      message: "Variable 'x' is constant and may not be reassigned",
    });
    const n = checkLuau("local a:Not<false?>=false", {
      fixture: "NegationFixture",
      flags: {
        LuauNewTypePathErrorMessages: true,
        LuauFixSuperNegationTypePaths: true,
      },
    });
    expect(n.diagnostics[0]?.message).toContain("cannot be `~(false?)`");
    expect(() =>
      checkLuau("export const x=1", { flags: { LuauExportValueSyntax: true } }),
    ).toThrow(/not implemented.*LuauExportValueSyntax/);
    expect(() =>
      checkLuau("local a=1", {
        flags: { LuauFixSuperNegationTypePaths: false },
      }),
    ).toThrow(/not implemented.*LuauFixSuperNegationTypePaths/);
  });
  test("discarded nonpersistent diagnostic graphs are owned by the public arena", () => {
    const source = "local x:{a:number}={a=1}\nlocal y:number=x";
    const frontend = new Frontend();
    const realCheck = frontend.checkSourceModule.bind(frontend);
    let original: TypeId | undefined;
    // Observe the real checker's returned cell before the harness clones it;
    // this wrapper returns the unmodified real result, with no mock outcome.
    frontend.checkSourceModule = (...args) => {
      const result = realCheck(...args);
      const error = result.module.errors.find(
        (e) => e.data.kind === "TypeMismatch",
      );
      if (error?.data.kind === "TypeMismatch") original = error.data.givenType;
      return result;
    };
    const session: LuauCheckSession = {
      frontend,
      fixture: "Fixture",
      modules: new Map(),
    };
    const r = checkLuau(source, { session, retainFullTypeGraphs: false });
    const module = session.modules.get("MainModule")!.module;
    const error = module.errors.find((e) => e.data.kind === "TypeMismatch")!;
    if (error.data.kind !== "TypeMismatch") throw new Error("missing mismatch");
    expect(original !== undefined).toBe(true);
    expect(original?.persistent).toBe(false);
    expect(error.data.givenType !== original).toBe(true);
    expect(error.data.givenType.persistent).toBe(false);
    expect(error.data.givenType.owningArena === module.interfaceTypes).toBe(
      true,
    );
    expect(module.interfaceTypes.types).toContain(error.data.givenType);
    expect(module.internalTypes.types).toHaveLength(0);
    expect(r.diagnostics[0]?.data?.["givenType"]).toBe("{ a: number }");
    expect(r.find({ diagnosticType: [0, "givenType"] }).print()).toBe(
      "{ a: number }",
    );
  });
  test("positive control: the ordinary checker executes", () => {
    expect(checkLuau("local x = 1").typeOf("x")).toBe("number");
  });
  test("module return pack paths preserve text versus identity", () => {
    const r = checkLuau(
      "export type Record = { x: number }\nlocal a: Record = {x=1}\nreturn {a=a}, 's'",
    );
    runAssertions(r, {
      source: "",
      expect: [
        {
          moduleReturn: true,
          path: [{ result: 0 }, { property: "a" }],
          printedSameAs: { alias: "Record" },
          options: { exhaustive: true },
        },
        { moduleReturn: true, path: [{ result: 1 }], equals: "string" },
      ],
    });
    expect(() => r.find({ moduleReturn: true, path: [{ result: 3 }] })).toThrow(
      /no type/,
    );
  });
  test("packs report exact head length and explicit tails", () => {
    const r = checkLuau(
      "local function f(a:number,...:string): (number,string) return a,'x' end",
    );
    expect(r.find({ type: "f" }).arguments).toEqual({
      length: 1,
      tail: true,
      tailKind: "VariadicTypePack",
    });
    runAssertions(r, {
      source: "",
      expect: [
        {
          type: "f",
          arguments: { length: 1, tail: true, tailKind: "VariadicTypePack" },
          returns: { length: 2, tail: false },
        },
      ],
    });
  });
  test("definitions and typed globals are installed and isolated", () => {
    const r = checkLuau("local x=foo(1,2)", {
      globals: { foo: "(...number) -> number" },
    });
    expect(r.typeOf("x")).toBe("number");
    expect(r.diagnostics).toHaveLength(0);
    const first = checkLuau("local x=foo", {
      definitions: ["declare foo: string"],
    });
    const second = checkLuau("local x=foo", {
      definitions: ["declare foo: number"],
    });
    expect(first.typeOf("x")).toBe("string");
    expect(second.typeOf("x")).toBe("number");
    expect(
      checkLuau("local x=foo").diagnostics.some(
        (d) => d.code === "UnknownSymbol",
      ),
    ).toBe(true);
  });
  test("named modules resolve imports and changes without cache leakage", () => {
    const source =
      "local Import=require(script.Parent.Types)\nlocal x:Import.T=1\nreturn x";
    const opts = {
      fixture: "BuiltinsFixture",
      module: "game/Main",
      moduleSources: { "game/Types": "export type T=number\nreturn 1" },
    };
    const r = checkLuau(source, opts);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.find({ importedAlias: ["Import", "T"] }).print()).toBe("number");
    runAssertions(r, {
      source: "",
      expect: [
        {
          scopes: {
            count: 1,
            importedModules: [
              { scope: 0, name: "Import", module: "game/Types" },
            ],
          },
        },
      ],
    });
    expect(r.find({ typeAt: [1, 17], module: "game/Types" })).toBeDefined();
    const changed = checkLuau(
      "local Import=require(game.Types)\nlocal x:Import.T='a'",
      {
        ...opts,
        moduleSources: { "game/Types": "export type T=string\nreturn 'a'" },
      },
    );
    expect(changed.typeOf("x")).toBe("string");
  });
  test("subtyping uses the real checker in both directions", () => {
    const r = checkLuau("local a:number=1\nlocal b:number|string='x'");
    expect(r.find({ type: "a" }).subtypeOf(r.find({ type: "b" }))).toBe(true);
    expect(r.find({ type: "b" }).subtypeOf(r.find({ type: "a" }))).toBe(false);
  });
  test("extern inheritance and members execute in the real fixture", () => {
    const r = checkLuau(
      "local c=ChildClass.New()\nlocal b:number=c.BaseField\nlocal s:string=c:Method()",
      { fixture: "ExternTypeFixture" },
    );
    expect(r.checked).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.typeOf("c")).toBe("ChildClass");
  });
  test("refinement extern fixture binds IsA's discriminant", () => {
    const r = checkLuau(
      "local function f(x:Instance)\nif x:IsA('Part') then\nlocal y=x.Position\nend\nend",
      { fixture: "RefinementExternTypeFixture" },
    );
    expect(r.checked).toBe(true);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.find({ typeAt: [2, 10] }).print()).toBe("Vector3");
  });
  test("normalization and inequality inspect actual selected types", () => {
    const r = checkLuau("local x:string?=nil");
    expect(r.find({ type: "x", normalized: true }).print()).toBe("string?");
    runAssertions(r, {
      source: "",
      expect: [{ type: "x", notEquals: "never" }],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ type: "x", notEquals: "string?" }],
      }),
    ).toThrow();
  });
  test("unknown and conflicting flag requests are explicit failures", () => {
    expect(() =>
      checkLuau("local x=1", { flags: { MadeUpFlag: true } }),
    ).toThrow(/not implemented.*MadeUpFlag/);
    expect(() =>
      checkLuau("local x=1", { flags: { DebugLuauForceOldSolver: true } }),
    ).toThrow(/not implemented.*DebugLuauForceOldSolver/);
  });
  test("decorates real inferred function and local annotations", () => {
    const r = checkLuau("local a = 1\nlocal function f(x:number) return x end");
    expect(r.decoratedSource()).toBe(
      "local a:number=1\nlocal function f(x:number): number return x end",
    );
    expect(
      checkLuau(
        "local function f(...:number) return ... end",
      ).decoratedSource(),
    ).toBe("local function f(...:number): ...number return...end");
  });
  test("upstream generic declarations expose kind, polarity and identity", () => {
    const r = checkLuau("local function f<T>(x:T):T return x end");
    runAssertions(r, {
      source: "",
      expect: [
        { type: "f", generics: 1, genericPacks: 0 },
        {
          type: "f",
          path: [{ generic: 0 }],
          kind: "GenericType",
          polarity: "Mixed",
        },
        {
          type: "f",
          path: [{ argument: 0 }],
          sameAs: { type: "f", path: [{ generic: 0 }] },
        },
      ],
    });
    expect(() =>
      runAssertions(r, { source: "", expect: [{ type: "f", generics: 0 }] }),
    ).toThrow();
  });
  test("table instantiation arguments differ from alias declarations", () => {
    const r = checkLuau(
      "type Packed<T,U...>={f:(T,U...)->(T,U...)}\nlocal a:Packed<number>\nlocal b:Packed<string,number,boolean>",
    );
    runAssertions(r, {
      source: "",
      expect: [
        { alias: "Packed", typeParameters: 1 },
        {
          type: "b",
          instantiatedTypeParameters: 1,
          instantiatedTypePackParameters: 1,
        },
        {
          type: "b",
          path: [{ instantiatedTypeParameter: 0 }],
          sameAs: { builtin: "string" },
        },
        {
          type: "b",
          path: [{ instantiatedTypePackParameter: 0 }],
          equals: "number, boolean",
        },
      ],
    });
    expect(() =>
      r.find({ type: "a", path: [{ instantiatedTypeParameter: 1 }] }),
    ).toThrow(/no type/);
  });
  test("hasSelf and resolved overload are inspected rather than inferred from text", () => {
    const r = checkLuau(
      "local t={}\nfunction t:method(x:number) return x end\nlocal f=((nil::any)::((number)->number)&((string)->string))\nlocal n=f(1)",
    );
    expect(r.find({ type: "t", path: [{ property: "method" }] }).hasSelf).toBe(
      true,
    );
    expect(r.find({ overloadAt: [3, 9] }).print()).toBe("(number) -> number");
    expect(r.find({ typeAt: [3, 8] }).kind).toBe("IntersectionType");
  });
  test("diagnostic substrings, end line, field printing and identity are actual queries", () => {
    const r = checkLuau(
      "type V={x:number,y:number}\nlocal x:V={x=1,y=2}\nlocal y:number=x",
    );
    runAssertions(r, {
      source: "",
      expect: [
        {
          error: 0,
          endLine: 2,
          messageContains: "number",
          messageExcludes: "VALUELESS",
          moduleMatchesCheck: true,
          fields: { givenType: "{ x: number, y: number }" },
          fieldOptions: { givenType: { exhaustive: true } },
        },
        { diagnosticType: [0, "wantedType"], sameAs: { builtin: "number" } },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ error: 0, messageExcludes: "number" }],
      }),
    ).toThrow();
    expect(() => r.find({ diagnosticType: [0, "missing"] })).toThrow(/no type/);
    expect(r.find({ builtin: "error" }).print()).toBe("*error-type*");
  });
  test("hidden aliases augment the named fixture only for their check", () => {
    const r = checkLuau("local x:fun=print", {
      fixture: "BuiltinsFixture",
      hiddenTypes: true,
    });
    expect(r.diagnostics).toHaveLength(0);
    expect(r.find({ alias: "fun" }).is(r.find({ builtin: "function" }))).toBe(
      true,
    );
    expect(
      checkLuau("local x:fun=print", {
        fixture: "BuiltinsFixture",
      }).diagnostics.some((d) => d.code === "UnknownSymbol"),
    ).toBe(true);
  });
  test("graph discard retains cloned diagnostics and public interface", () => {
    const r = checkLuau("local x:number='s'\nreturn 1", {
      retainFullTypeGraphs: false,
    });
    expect(r.diagnostics[0]?.data).toMatchObject({
      wantedType: "number",
      givenType: "string",
    });
    expect(r.find({ moduleReturn: true, path: [{ result: 0 }] }).print()).toBe(
      "number",
    );
    expect(() => r.find({ type: "x" })).toThrow(/discarded internal graphs/);
    expect(() => r.decoratedSource()).toThrow(/discarded/);
  });
  test("explicit shared fixture clears module caches while retaining bindings", () => {
    const session: LuauCheckSession = { modules: new Map() };
    const a = checkLuau("local x=sentinel", {
      session,
      fixture: "BuiltinsFixture",
      globals: { sentinel: "number" },
    });
    expect(a.typeOf("x")).toBe("number");
    const b = checkLuau("local y=sentinel", {
      session,
      fixture: "BuiltinsFixture",
      clearModules: true,
    });
    expect(b.typeOf("y")).toBe("number");
    expect(
      checkLuau("local y=sentinel", {
        fixture: "BuiltinsFixture",
      }).diagnostics.some((d) => d.code === "UnknownSymbol"),
    ).toBe(true);
    const original = checkLuau("local original=string.len", {
      session,
      fixture: "BuiltinsFixture",
    }).find({ type: "original" });
    checkLuau("function string.len():number return 1 end", {
      session,
      fixture: "BuiltinsFixture",
    });
    const after = checkLuau(
      "local after=string.len\nlocal n=string.len('hello')",
      { session, fixture: "BuiltinsFixture", clearModules: true },
    );
    expect(after.diagnostics).toHaveLength(0);
    expect(after.find({ type: "after" }).is(original)).toBe(true);
    expect(after.typeOf("n")).toBe("number");
  });
  test("every setup source receives its own parse diagnostics", () => {
    const r = checkLuau("local x=1", {
      moduleSources: { "game/Bad": "local x = )" },
      definitions: ["declare foo: )"],
    });
    expect(r.setupSyntaxDiagnostics?.map((d) => d.module)).toEqual(
      expect.arrayContaining(["game/Bad", "@definitions/0"]),
    );
    expect(() =>
      runPortedCase(
        "TypeInfer.annotations.test.cpp",
        {
          name: "probe",
          source: "local x=1",
          moduleSources: { "game/Bad": "local x = )" },
          expect: [],
        },
        () => {},
      ),
    ).toThrow(/setup source/);
    expect(() =>
      checkLuau("local x=1", {
        module: "MainModule",
        moduleSources: { MainModule: "return 1" },
      }),
    ).toThrow(/duplicated/);
  });
  test("metadata assertions retain property, alias and scope source locations", () => {
    const r = checkLuau("export type T = {x:number}\nlocal t:T={x=1}");
    runAssertions(r, {
      source: "",
      expect: [
        { exportedAlias: "T", definitionLocation: [0, 0, 0, 26] },
        {
          alias: "T",
          hasProperty: ["x"],
          propertyLocations: {
            x: { location: null, typeLocation: [0, 17, 0, 18] },
          },
        },
        {
          scopes: {
            minimum: 1,
            aliases: [{ scope: 0, name: "T", location: [0, 12, 0, 13] }],
          },
        },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ alias: "T", hasProperty: ["missing"] }],
      }),
    ).toThrow();
  });
  test("expected types select the contextual map rather than actual types", () => {
    const r = checkLuau("local f: (number)->number = function(x) return x end");
    expect(r.find({ expectedTypeAt: [0, 30] }).print()).toBe(
      "(number) -> number",
    );
    expect(() => r.find({ expectedTypeAt: [0, 45] })).toThrow(/no type/);
  });
  test("identity inequality, nested scopes and previous locations remain distinct", () => {
    const r = checkLuau(
      "local a={x=1}\nlocal b={x=2}\ndo\ntype T=string\nend\ntype U=number\ntype U=string",
    );
    runAssertions(r, {
      source: "",
      expect: [
        {
          type: "a",
          notSameAs: { type: "b" },
          printedSameAs: { type: "b" },
          options: { exhaustive: true },
        },
        {
          scopes: {
            aliases: [
              { scopeAt: [2, 0], name: "T", location: [3, 5, 3, 6] },
              { scopeAt: [100, 0], name: "U", location: [6, 5, 6, 6] },
            ],
          },
        },
        {
          error: 0,
          code: "DuplicateTypeDefinition",
          fieldLocations: { previousLocation: { present: true, line: 5 } },
        },
        { everyError: { messageExcludes: "VALUELESS" } },
      ],
    });
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ type: "a", notSameAs: { type: "a" } }],
      }),
    ).toThrow();
    expect(() =>
      runAssertions(r, {
        source: "",
        expect: [{ everyError: { messageExcludes: "U" } }],
      }),
    ).toThrow();
  });
  test("new malformed vocabulary is rejected by coverage validation", () => {
    const manifest = {
      pin: "test",
      errorKinds: ["TypeMismatch"],
      files: { "X.test.cpp": [{ name: "a" }] },
    };
    const malformed: unknown[] = [
      { type: "x", arguments: { length: -1 } },
      { type: "x", returns: { tail: 1 } },
      { type: "x", flattenedArguments: { length: -1 } },
      { type: "x", flattenedReturns: { tailKind: "ImaginaryPack" } },
      { type: "x", hasSelf: 1 },
      { type: "x", path: [{ generic: -1 }] },
      { importedAlias: ["a"] },
      { type: "x", normalized: false },
      { overloadAt: [-1, 0] },
      { type: "x", notSameAs: { type: "y", equals: "ignored" } },
      { type: "x", notEquals: 1 },
      { type: "x", options: { maxTableLength: -1 }, equals: "" },
      { error: 0, messageContains: 1 },
      { error: 0, fieldOptions: { givenType: { exhaustive: true } } },
      { type: "x", propertyLocations: { x: { madeUp: [0, 0, 0, 0] } } },
      {
        scopes: {
          minimum: 0,
          aliases: [{ name: "T", location: [0, 0, 0, 1] }],
        },
      },
    ];
    for (const expectation of malformed) {
      const c = {
        name: "a",
        source: "",
        expect: [expectation],
      } as unknown as PortedCase;
      expect(
        portProblems("X.test.cpp", [c], manifest).length,
        JSON.stringify(expectation),
      ).toBeGreaterThan(0);
    }
    const invalid = [
      { definitions: [1] },
      { globals: { "bad-name": "number" } },
      { moduleSources: { "": 1 } },
      { hiddenTypes: false },
      { retainFullTypeGraphs: true },
      { clearModules: true },
      { flags: { Flag: 1 } },
    ];
    for (const setup of invalid)
      expect(
        portProblems(
          "X.test.cpp",
          [
            {
              name: "a",
              source: "",
              expect: [],
              ...setup,
            } as unknown as PortedCase,
          ],
          manifest,
        ).length,
      ).toBeGreaterThan(0);
    const assertions: Assertion[] = [
      { type: "x", arguments: { length: 1, tail: false } },
      { type: "x", notEquals: "never" },
      {
        type: "x",
        printedSameAs: { type: "y" },
        options: { exhaustive: true },
      },
      {
        error: 0,
        fields: { givenType: "number" },
        fieldOptions: { givenType: { exhaustive: true } },
      },
    ];
    expect(
      portProblems(
        "X.test.cpp",
        [{ name: "a", source: "", expect: assertions }],
        manifest,
      ),
    ).toEqual([]);
  });
});
