import { afterEach, expect, it, vi } from "vitest";
import { runNativePortedCase } from "../../luau-conformance/typecheck/portedCases";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";

afterEach(() => { vi.unstubAllEnvs(); });
const file = "TypeInfer.primitives.test.cpp";

it("retains real definition setup across source replacement and frontend clear in one registered native case", async () => {
  let retained: NativeFixture | undefined; let count = 0;
  await runNativePortedCase(file,{name:"same global setup",fixture:"Fixture",checks:[
    {source:"local first = persisted",definitions:["declare persisted: string"],expect:[{errors:0},{type:"first",equals:"string"}]},
    {source:"local second = persisted",clearModules:true,expect:[{errors:0},{type:"second",equals:"string"}]},
  ]},() => { throw Error("active native case skipped"); },async () => { count++; return retained = await loadNativeFixture(); });
  expect(count).toBe(1); expect(() => retained!.heapBytes()).toThrow("Disposed native fixture host");
  await runNativePortedCase(file,{name:"isolated next case",fixture:"Fixture",source:"local value = persisted",
    expect:[{errors:1},{error:0,code:"UnknownSymbol",fields:{name:"persisted",context:"Binding"}}]},vi.fn());
});

it("disposes the actual case fixture after assertion and operation-flag setup failures", async () => {
  const retained: NativeFixture[] = [];
  const load = async () => { const fixture = await loadNativeFixture(); retained.push(fixture); return fixture; };
  await expect(runNativePortedCase(file,{name:"wrong assertion",source:"local value = 1",
    expect:[{type:"value",equals:"string"}]},vi.fn(),load)).rejects.toThrow();
  await expect(runNativePortedCase(file,{name:"invalid setup",flags:{NotARegisteredFlag:true},source:"local value = 1",
    expect:[{errors:0}]},vi.fn(),load)).rejects.toThrow("Unknown or mistyped");
  expect(retained).toHaveLength(2);
  retained.forEach(fixture => expect(() => fixture.heapBytes()).toThrow("Disposed native fixture host"));
});

it("keeps guarded checks parser-only inside an active case and applies real registered native FInts", async () => {
  const retained: NativeFixture[] = [];
  await runNativePortedCase(file,{name:"scoped integer",limits:{LuauTarjanChildLimit:10000},fixture:"Fixture",checks:[
    {source:"local value = 1",expect:[{errors:0},{type:"value",equals:"number"}]},
    {source:"local oldOnly = missing",doesNotPassNewSolver:true,expect:[{errors:99}]},
    {source:"local next = 2",expect:[{errors:0},{type:"next",equals:"number"}]},
  ]},vi.fn(),async () => {
    const fixture = await loadNativeFixture(); retained.push(fixture);
    const check = fixture.check.bind(fixture);
    const spy = vi.spyOn(fixture,"check").mockImplementation((...args) => {
      expect(fixture.scopedFlagValue("LuauTarjanChildLimit")).toBe(10000); return check(...args);
    });
    expect(spy).not.toHaveBeenCalled(); return fixture;
  });
  expect(retained).toHaveLength(1);
  expect(retained[0]!.check).toHaveBeenCalledTimes(2);
  expect(() => retained[0]!.heapBytes()).toThrow("Disposed native fixture host");
});
