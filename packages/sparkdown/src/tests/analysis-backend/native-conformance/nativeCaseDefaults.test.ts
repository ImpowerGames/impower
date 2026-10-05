import { afterEach, expect, it, vi } from "vitest";
import { runPortedCase, type PortedCase } from "../../luau-conformance/typecheck/portedCases";
import type { CheckLuauOptions, CheckedType, LuauCheckResult, LuauCheckSession } from "../../luau-conformance/typecheckTestHarness";
import { withNativeCase } from "../../luau-conformance/typecheckNativeCase";
import type { NativeFixture, TypeHandle } from "./nativeFixture";

afterEach(() => { vi.unstubAllEnvs(); });

it("shares the default case fixture's real native definition environment, then isolates the next case", async () => {
  vi.stubEnv("LUAU_TYPECHECK_AREAS", "all");
  const fixtures: NativeFixture[] = [];
  // Capacity two is a deliberate pre-fix control: the legacy default constructs two
  // independent fixtures and loses sentinel. Correct default uses only one instance.
  await withNativeCase(2, scope => {
    const sessions = new WeakMap<LuauCheckSession, NativeFixture>();
    const check = (source: string, options: CheckLuauOptions = {}): LuauCheckResult => {
      const session = options.session ?? { modules: new Map() };
      let fixture = sessions.get(session);
      if (!fixture) { fixture = scope.acquire(); fixture.create("Fixture"); sessions.set(session, fixture); fixtures.push(fixture); }
      const native = fixture;
      for (const definition of options.definitions ?? []) native.definition(definition);
      native.source("MainModule", source); const result = native.check("MainModule");
      expect(result.diagnostics, `native source ${JSON.stringify(source)}: ${JSON.stringify(result.diagnostics)}`).toEqual([]);
      const types = new WeakMap<CheckedType, TypeHandle>();
      const checked = (type: TypeHandle): CheckedType => {
        const facts = native.facts(type);
        if (facts.kind !== "primitive") throw Error("Unsupported control type kind: " + facts.kind);
        const value: CheckedType = { print: options => native.printedOptions(type, options), kind: "PrimitiveType",
          is: other => native.identical(type, types.get(other)!), subtypeOf: other => native.subtypeOf(type, types.get(other)!) };
        types.set(value, type); return value;
      };
      return { checked: true, syntaxDiagnostics: [], compilerMessages: [], moduleName: "MainModule",
        diagnostics: result.diagnostics.map(error => ({ line: error.begin.line, column: error.begin.column,
          endLine: error.end.line, endColumn: error.end.column, code: error.kind, message: error.message })),
        typeOf: name => native.printed(native.mainType(result, name)),
        find: selector => {
          if (!("type" in selector)) throw Error("Unsupported control selector");
          return checked(native.mainType(result, selector.type));
        }, decoratedSource: () => native.decorated(result, "MainModule") };
    };
    const c: PortedCase = { name: "retained native environment", fixture: "Fixture", checks: [
      { source: "local first = sentinel", definitions: ["declare sentinel: number"], expect: [{ errors: 0 }, { type: "first", equals: "number" }] },
      { source: "local second = sentinel", expect: [{ errors: 0 }, { type: "second", equals: "number" }] },
    ] };
    runPortedCase("Other.test.cpp", c, () => { throw Error("Unexpected skipped control"); }, check);
    expect(fixtures).toHaveLength(1);
  });
  fixtures.forEach(fixture => expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host"));
  await withNativeCase(1, scope => {
    const fresh = scope.acquire(); fresh.create("Fixture"); fresh.source("MainModule", "local third = sentinel");
    const result = fresh.check("MainModule");
    expect(result.diagnostics.map(error => error.kind)).toEqual(["UnknownSymbol"]);
  });
});
