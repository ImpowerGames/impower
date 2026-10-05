import { describe, expect, test } from "vitest";
import { checkLuau } from "./typecheckTestHarness";

describe("pinned table inference regressions", () => {
  test.each([
    {
      name: "found_like_key_in_table_function_call",
      fixture: "Fixture",
      source: `
        local t = {}
        function t.Foo() end

        t.fOo()
    `,
      key: "fOo",
      candidates: ["Foo"],
    },
    {
      name: "found_like_key_in_table_property_access",
      fixture: "BuiltinsFixture",
      source: `
        local t = {X = 1}

        print(t.x)
    `,
      key: "x",
      candidates: ["X"],
    },
    {
      name: "found_multiple_like_keys",
      fixture: "BuiltinsFixture",
      source: `
        local t = {Foo = 1, foO = 2}

        print(t.foo)
    `,
      key: "foo",
      candidates: ["Foo", "foO"],
    },
  ])("preserves diagnostic table text and the exact candidate set: $name", ({ fixture, source, key, candidates }) => {
    const result = checkLuau(source, { fixture });
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0]!;
    expect(diagnostic.code).toBe("UnknownPropButFoundLikeProp");
    expect(diagnostic.data).toMatchObject({ table: result.typeOf("t"), key });
    const actual = diagnostic.data?.["candidates"];
    if (!Array.isArray(actual)) throw new Error("diagnostic candidates must be an array");
    expect(actual).toHaveLength(candidates.length);
    expect(new Set(actual)).toEqual(new Set(candidates));
  });

  test("preserves pinned mismatch and missing-property diagnostic order", () => {
    const result = checkLuau(`
        type MixedTable = {[number]: number, x: number}
        local t: MixedTable = {"fail"}
    `, { fixture: "Fixture" });
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics.map(d => ({ code: d.code, line: d.line, column: d.column, data: d.data }))).toMatchObject([
      { code: "TypeMismatch", data: { wantedType: "number", givenType: "string" } },
      { code: "MissingProperties", data: { context: "Missing", properties: ["x"] } },
    ]);
  });

  test("evaluates the declared optional type function before inferring its table", () => {
    const result = checkLuau(`
        type function Optional(t)
            return types.unionof(t, types.singleton(nil))
        end

        type Config = {
            host: string,
            port: number,
            verbose: boolean?,
        }

        local cfg: Optional<Config> = {
            host = "localhost",
            port = 8080,
            verbose = true,
        }
    `, { fixture: "BuiltinsFixture" });
    expect(result.syntaxDiagnostics).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});
