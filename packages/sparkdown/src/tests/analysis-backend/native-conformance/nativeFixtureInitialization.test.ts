import { afterEach, beforeEach, expect, it } from "vitest";
import { loadNativeFixture, type NativeFixture } from "./nativeFixture";

let fixture: NativeFixture;
beforeEach(async () => { fixture = await loadNativeFixture(); });
afterEach(() => { fixture?.dispose(); });

it("applies original case flags at the first lazy frontend setup and restores operation state", () => {
  // Original ClassesFixture fields (TypeInfer.classes.test.cpp53–55) set this
  // flag before its first getFrontend; GlobalTypes.cpp29 installs class/object
  // aliases only during that construction, not during later checks.
  fixture.flag("DebugLuauUserDefinedClasses", true, "initialization"); fixture.create("Fixture");
  expect(fixture.printed(fixture.globalAlias(fixture.context(), "class"))).toBe("class");
  fixture.clearFlags(); fixture.create("Fixture");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
  fixture.flag("DebugLuauUserDefinedClasses", true);
  expect(fixture.scopedFlagValue("DebugLuauUserDefinedClasses")).toBe(true);
  expect(fixture.printed(fixture.globalAlias(fixture.context(), "class"))).toBe("class");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
  fixture.clearFlags();
  // Changing the operation flag after construction preserves actual installed
  // aliases; it must not rebuild the environment to produce the expected answer.
  expect(fixture.printed(fixture.globalAlias(fixture.context(), "class"))).toBe("class");
});

it("preserves missing aliases when the first native frontend setup preceded a later flag change", () => {
  fixture.create("Fixture");
  expect(() => fixture.globalAlias(fixture.context(), "class")).toThrow("Missing native global alias");
  fixture.flag("DebugLuauUserDefinedClasses", true);
  expect(() => fixture.globalAlias(fixture.context(), "class")).toThrow("Missing native global alias");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
});

it("keeps source registration separate from first frontend setup and still dirties an existing checked module", () => {
  fixture.create("Fixture"); fixture.source("MainModule", "return 1");
  fixture.flag("DebugLuauUserDefinedClasses", true);
  const first = fixture.check("MainModule");
  expect(fixture.printed(fixture.globalAlias(first,"class"))).toBe("class");
  expect(fixture.printedPack(fixture.modulePack(first,"MainModule"))).toBe("number");
  fixture.source("MainModule", "return 'changed'");
  const changed = fixture.check("MainModule");
  expect(fixture.printedPack(fixture.modulePack(changed,"MainModule"))).toBe("string");
  fixture.clearFlags(); fixture.create("Fixture");
  fixture.flag("DebugLuauUserDefinedClasses",true); fixture.source("MainModule","return 1");
  fixture.clearFlags();
  expect(() => fixture.globalAlias(fixture.check("MainModule"),"class")).toThrow("Missing native global alias");
});

it("scopes case flags over first source setup, failures and explicit reset without altering construction flags", () => {
  fixture.create("Fixture"); fixture.flag("DebugLuauUserDefinedClasses", true);
  expect(fixture.observe("source", "MainModule", "return 1", 9).status).toBe("error");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
  fixture.source("MainModule", "return 1");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
  const result = fixture.check("MainModule"); expect(result.diagnostics).toEqual([]);
  expect(fixture.printed(fixture.globalAlias(result,"class"))).toBe("class");
  fixture.clearFlags(); fixture.reset();
  expect(() => fixture.globalAlias(fixture.context(),"class")).toThrow("Missing native global alias");
  fixture.flag("DebugLuauUserDefinedClasses",true); fixture.reset();
  expect(fixture.printed(fixture.globalAlias(fixture.context(),"class"))).toBe("class");
  expect(fixture.flagValue("DebugLuauUserDefinedClasses")).toBe(false);
});
