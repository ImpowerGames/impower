import { afterEach, beforeEach, expect, it } from "vitest";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";
import { emptyClassSource, negatedStringSubtypeSource, negatedStringNotSubtypeSource, mismatchingFunctionAritySource } from "./fixtureSources";

let fixture: NativeFixture;
beforeEach(async () => { fixture = await loadNativeFixture(); });
afterEach(() => { fixture?.dispose(); });

it("executes the exact lazy ClassesFixture setup with its constructor flags", () => {
  // Native preset ordinals are the instrumented ABI, not a substitute fixture.
  expect(fixture.observe("create", 6).status).toBe("ok");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(true);
  expect(fixture.flagValue("LuauAllowGlobalDeclarationToBeCalledClass")).toBe(true);
  fixture.source("MainModule", emptyClassSource);
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  expect(fixture.facts(fixture.global(result,"require")).kind).toBe("function");
  expect(fixture.printed(fixture.global(result,"sqrt"))).toBe("(number) -> number");
});

it("executes the eager NegationFixture hidden-type setup and original negative", () => {
  expect(fixture.observe("create", 7).status).toBe("ok");
  fixture.source("MainModule", negatedStringSubtypeSource);
  expect(fixture.check("MainModule").diagnostics).toEqual([]);
  fixture.source("MainModule", negatedStringNotSubtypeSource);
  expect(fixture.check("MainModule").diagnostics).toHaveLength(1);
});

it("uses the ClassesFixture real MagicRequire rather than its declared any return", () => {
  const imported = "local dependency = require(game.A); local value = dependency.value";
  fixture.create("ClassesFixture");
  fixture.source("game/A","return {value=1}"); fixture.source("game/B",imported);
  const result = fixture.check("game/B"); expect(result.diagnostics).toEqual([]);
  expect(fixture.identical(fixture.follow(fixture.binding(result,"game/B","value")),fixture.builtin(result,"number"))).toBe(true);
  // Same native resolver plus a real ordinary declaration lacking attached
  // MagicRequire observes any; no answer-derived setup or fixture substitution.
  fixture.create("Fixture"); fixture.definition("declare game: any\ndeclare function require(target:any):any");
  fixture.source("game/A","return {value=1}"); fixture.source("game/B",imported);
  const ordinary = fixture.check("game/B"); expect(ordinary.diagnostics).toEqual([]);
  expect(fixture.identical(fixture.follow(fixture.binding(ordinary,"game/B","value")),fixture.builtin(ordinary,"any"))).toBe(true);
});

it("uses the original IsSubtypeFixture and exact selected-new directional assertions", () => {
  expect(fixture.observe("create", 8).status).toBe("ok");
  fixture.source("MainModule", mismatchingFunctionAritySource);
  const result = fixture.check("MainModule"); // Upstream does not assert no errors.
  const a = fixture.mainType(result,"a"), b = fixture.mainType(result,"b"), c = fixture.mainType(result,"c");
  expect(fixture.subtypeOf(a,b)).toBe(false);
  expect(fixture.subtypeOf(a,c)).toBe(false);
  expect(fixture.subtypeOf(b,c)).toBe(false);
});

it("restores constructor flags across reset, replacement and partial setup failure", () => {
  fixture.flag("DebugLuauFreezeArena",true,"initialization");
  fixture.create("ClassesFixture");
  fixture.source("MainModule",emptyClassSource); expect(fixture.check("MainModule").diagnostics).toEqual([]);
  fixture.reset(); expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(true);
  fixture.source("MainModule",emptyClassSource); expect(fixture.check("MainModule").diagnostics).toEqual([]);
  fixture.create("Fixture"); expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
  fixture.create("ClassesFixture");
  // GlobalTypes.cpp29 only installs the definition's class alias under this
  // flag. The declaration grammar flag is retained but unused by this pin.
  fixture.flag("DebugLuauUserDefinedClasses",false);
  const context = fixture.context();
  const failure = fixture.observe("global_alias",context.session,context.revision,"class");
  expect(failure).toMatchObject({status:"setup-error",success:false,arenaFrozen:true});
  expect(failure.parseErrors).toEqual([]);
  expect(failure["diagnostics"]).toMatchObject([{kind:"UnknownSymbol"},{kind:"UnknownSymbol"}]);
  expect(fixture.observe("context")).toMatchObject({status:"error",message:"Conformance session requires create"});
  fixture.clearFlags(); fixture.create("ClassesFixture");
  fixture.source("MainModule",emptyClassSource); expect(fixture.check("MainModule").diagnostics).toEqual([]);
});

it("observes actual baseline FValues before construction and after failed partial session teardown", () => {
  const baselineClass = fixture.flagValue("DebugLuauUserDefinedClasses");
  const baselineDeclare = fixture.flagValue("LuauAllowGlobalDeclarationToBeCalledClass");
  fixture.create("ClassesFixture");
  fixture.flag("DebugLuauUserDefinedClasses",false);
  const context = fixture.context();
  expect(fixture.observe("global_alias",context.session,context.revision,"class").status).toBe("setup-error");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(baselineClass);
  expect(fixture.flagValue("LuauAllowGlobalDeclarationToBeCalledClass")).toBe(baselineDeclare);
});

it("keeps the eager negation constructor distinct from later case flags", () => {
  fixture.create("NegationFixture");
  fixture.flag("DebugLuauUserDefinedClasses",true);
  expect(() => fixture.globalAlias(fixture.context(),"class")).toThrow("Missing native global alias");
  fixture.clearFlags(); fixture.flag("DebugLuauUserDefinedClasses",true,"initialization");
  fixture.create("NegationFixture");
  expect(fixture.printed(fixture.globalAlias(fixture.context(),"class"))).toBe("class");
  fixture.clearFlags(); fixture.create("Fixture");
  fixture.source("MainModule",negatedStringSubtypeSource);
  expect(fixture.check("MainModule").diagnostics.length).toBeGreaterThan(0);
});

it("preserves the ClassesFixture original old-solver guard without silently selecting new", () => {
  fixture.flag("DebugLuauForceAllOldSolverTests",true,"initialization");
  fixture.create("ClassesFixture");
  expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(true);
  fixture.source("MainModule",emptyClassSource);
  expect(() => fixture.check("MainModule")).toThrow("Native conformance requires selected new solver");
  fixture.clearFlags(); fixture.create("Fixture");
  expect(fixture.flagValue("DebugLuauForceOldSolver")).toBe(false);
});
