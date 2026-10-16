import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";
import { generalSource, overloadSource, refinementSource, tableSource } from "./fixtureSources";

// Remaining area representatives live in nativeFixtureGraphs (generics, unions,
// externs/modules, nonstrict) and nativeFixtureSession (builtins/real type functions).
describe("exact native area representatives", () => {
  let fixture: NativeFixture;
  beforeEach(async () => { fixture = await loadNativeFixture(); });
  afterEach(() => { fixture?.dispose(); });

  it("preserves general inference tc_hello_world", () => {
    fixture.create("Fixture"); fixture.source("MainModule", generalSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    expect(fixture.printed(fixture.binding(result, "MainModule", "a"))).toBe("number");
  });

  it("preserves table basic and all three primitive properties", () => {
    fixture.create("Fixture"); fixture.source("MainModule", tableSource);
    const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
    const table = fixture.binding(result, "MainModule", "t"); expect(fixture.facts(table).kind).toBe("table");
    for (const [name, expected] of [["foo", "string"], ["baz", "number"], ["quux", "nil"]]) {
      const property = fixture.child(table, "read", name!);
      expect(fixture.facts(property).kind).toBe("primitive");
      expect(fixture.printed(property)).toBe(expected);
    }
    expect(() => fixture.child(table, "read", "absent")).toThrow("Missing native own property");
  });

  it("preserves overload_resolution and actual ordered return pack types", () => {
    fixture.create("Fixture"); fixture.source("MainModule", overloadSource);
    const result = fixture.check("MainModule");
    expect(result.diagnostics.filter(error => error.kind !== "TypeAnnotationRequired")).toEqual([]);
    const functionType = fixture.binding(result, "MainModule", "foo");
    expect(fixture.facts(functionType).kind).toBe("function");
    expect(fixture.printed(functionType)).toBe("(((number) -> string) & ((string) -> number)) -> (string, number)");
    const direct = fixture.functionPack(functionType, "returns", false);
    const flat = fixture.functionPack(functionType, "returns", true);
    expect(direct.direct).toBe(true);
    // The direct native pack retains the second call's pack as its tail.
    expect(direct.head.map(type => fixture.printed(type))).toEqual(["string"]);
    expect(flat.head.map(type => fixture.printed(type))).toEqual(["string", "number"]);
    expect(direct.head.map(type => fixture.printed(type))).not.toEqual(flat.head.map(type => fixture.printed(type)));
    expect(direct.tail).toBe(true); expect(direct.tailKind).toBe("pack"); expect(flat.tail).toBe(false);
  });

  it("preserves impossible_type_narrow_is_not_an_error", () => {
    fixture.create("BuiltinsFixture"); fixture.source("MainModule", refinementSource);
    expect(fixture.check("MainModule").diagnostics).toEqual([]);
    fixture.create("Fixture"); fixture.source("MainModule", refinementSource);
    expect(fixture.check("MainModule").diagnostics).not.toEqual([]);
  });
});
