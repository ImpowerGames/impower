import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runNativePortedCase, type PortedCase } from "../../luau-conformance/typecheck/portedCases";
import { checkSyntaxOnly } from "../../luau-conformance/typecheckNativeRunner";
import { hasLeadingClassDeclaration, validateClassDependencySource } from "./classDependencyExclusions";
import type { NativeFixture } from "./nativeFixture";
import { importedClassDependencySource as source, importedClassEntrySource as originalEntry,
  exportedClassDependencySource, nonExportedClassDependencySource } from "./fixtureSources";

beforeEach(() => vi.stubEnv("LUAU_TYPECHECK_AREAS","all"));
afterEach(() => vi.unstubAllEnvs());
const file = "TypeInfer.classes.test.cpp";
const record = (): Extract<PortedCase,{source:string}> => ({name:"isinstance_refines_imported_class",fixture:"unsupported semantic fixture",
  flags:{NotARegisteredFlag:true},source:"return 1",module:"game/B",moduleSources:{"game/A":source},
  moduleDivergences:{"game/A":{divergence:"No `class` declarations"}},expect:[{errors:99}]});
const noLoad = () => vi.fn(async (): Promise<NativeFixture> => { throw Error("Native load must not occur"); });

it("uses opaque existing tokens for leading class evidence and rejects comment/string/member/local occurrences", () => {
  expect(hasLeadingClassDeclaration(source)).toBe(true);
  expect(hasLeadingClassDeclaration("-- class Fake\nclass Real end")).toBe(true);
  for (const text of ["-- class Fake\nreturn 1","--[=[class Fake]=]\nreturn 1",'"class Fake"',
    "[=[class Fake]=]",'`class Fake {class.isinstance(x)}`',"class.isinstance(x)","obj.class", "local class = 1","export const class = 1"])
    expect(hasLeadingClassDeclaration(text),text).toBe(false);
});

it("excludes only the exact case/dependency before unsupported semantic setup and preserves source bytes", async () => {
  const load = noLoad(), skip = vi.fn(), current = record();
  await runNativePortedCase(file,current,skip,load);
  expect(load).not.toHaveBeenCalled(); expect(skip).toHaveBeenCalledTimes(1); expect(current.moduleSources!["game/A"]).toBe(source);
});

it("validates each of the three exact audited case/source associations with actual independent parser rejection", async () => {
  for (const [area,name,dependency] of [[file,"isinstance_refines_imported_class",source],
    ["TypeInfer.modules.test.cpp","export_class",exportedClassDependencySource],
    ["TypeInfer.modules.test.cpp","non_exported_class",nonExportedClassDependencySource]]) {
    const current = record(), load = noLoad(), skip = vi.fn(); current.name = name!; current.moduleSources!["game/A"] = dependency!;
    await runNativePortedCase(area!,current,skip,load); expect(skip).toHaveBeenCalledTimes(1); expect(load).not.toHaveBeenCalled();
  }
});

it("accepts only the original audit CRLF normalization, without trimming", async () => {
  const load = noLoad(), current = record(); current.moduleSources!["game/A"] = source.replace(/\n/g,"\r\n");
  expect(() => validateClassDependencySource(file,current.name,"game/A",current.moduleSources!["game/A"]!)).not.toThrow();
  // Existing wrappedSnippet at typecheckTestHarness.ts766 compares raw text
  // with the compiler's LF wrapper; provenance equivalence is not route parity.
  await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow("run no longer wraps a file as the harness expects");
  expect(load).not.toHaveBeenCalled();
  current.moduleSources!["game/A"] = source.trim();
  await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow("exact audited class source");
});

it("rejects empty, missing, misnamed or entry-module classifications without native construction", async () => {
  for (const map of [{},{"game/C":{divergence:"No `class` declarations"}},{"game/B":{divergence:"No `class` declarations"}}]) {
    const current = record(), load = noLoad(); current.moduleDivergences = map as NonNullable<typeof current.moduleDivergences>;
    await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow(); expect(load).not.toHaveBeenCalled();
  }
});

it("rejects wrong headings and swapped case/dependency provenance", async () => {
  const current = record(), load = noLoad();
  current.moduleDivergences = {"game/A":{divergence:"Unknown heading"}} as unknown as NonNullable<typeof current.moduleDivergences>;
  await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow("Unsupported named dependency divergence");
  const swapped = record(); swapped.name = "export_class";
  await expect(runNativePortedCase(file,swapped,vi.fn(),load)).rejects.toThrow("exact audited class source");
  const renamed = record(); renamed.moduleSources = {"game/C":source}; renamed.moduleDivergences = {"game/C":{divergence:"No `class` declarations"}};
  await expect(runNativePortedCase(file,renamed,vi.fn(),load)).rejects.toThrow("exact audited class source");
  expect(load).not.toHaveBeenCalled();
});

it("requires an exact rejected class source, refusing a clean source or appended unrelated malformed text", async () => {
  for (const replacement of ["return 1",source+"\nlocal missing ="]) {
    const current = record(), load = noLoad(); current.moduleSources!["game/A"] = replacement;
    await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow("exact audited class source"); expect(load).not.toHaveBeenCalled();
  }
});

it("removing the actual classification exposes original dependency syntax before semantic setup", async () => {
  const current = record(), load = noLoad(); delete current.moduleDivergences;
  await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow("unclassified setup source did not parse");
  expect(load).not.toHaveBeenCalled();
});

it("keeps an additional unclassified failing dependency independent of the accepted class source", async () => {
  const current = record(), load = noLoad(); current.moduleSources!["game/C"] = "local missing =";
  await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow("unclassified setup source did not parse");
  expect(load).not.toHaveBeenCalled();
});

it("retains exact original entry require syntax failures as B errors rather than class dependency eligibility", async () => {
  const current = record(), load = noLoad(), skip = vi.fn(); current.source = originalEntry;
  const parsed = checkSyntaxOnly(originalEntry,{module:"game/B",moduleSources:{"game/A":source}});
  expect(parsed.syntaxDiagnostics.length).toBeGreaterThan(0);
  expect(parsed.syntaxDiagnostics.every(error => error.module === "game/B")).toBe(true);
  expect(parsed.setupSyntaxDiagnostics!.length).toBeGreaterThan(0);
  expect(parsed.setupSyntaxDiagnostics!.every(error => error.module === "game/A")).toBe(true);
  await expect(runNativePortedCase(file,current,skip,load)).rejects.toThrow("Sparkdown did not read the snippet as Luau");
  expect(load).not.toHaveBeenCalled(); expect(skip).not.toHaveBeenCalled();
});

it("clean applicable dependencies return to honest unsupported semantic fixture execution", async () => {
  const current = record(), load = noLoad(); current.moduleSources!["game/A"] = "return 1"; delete current.moduleDivergences;
  await expect(runNativePortedCase(file,current,vi.fn(),load)).rejects.toThrow("Native load must not occur");
  expect(load).toHaveBeenCalledTimes(1);
});

it("rejects empty/mixed actions and unknown action or assertion shapes before loading", async () => {
  for (const shape of [{actions:[]},{actions:[{definition:"declare x:number",expect:[]}],source:"return 1"},
    {actions:[{definition:"declare x:number",expect:[{unsupported:true}]}]}, {actions:[{definition:"",check:{source:"return 1",expect:[]},expect:[{success:true}]}]}]) {
    const load = noLoad();
    await expect(runNativePortedCase(file,{name:"malformed action",...shape} as unknown as PortedCase,vi.fn(),load)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  }
});
