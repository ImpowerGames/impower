import { nonStrictDefinitions } from "../analysis-backend/native-conformance/fixtureSources";
import type { FixturePreset, NativeFixture } from "../analysis-backend/native-conformance/nativeFixture";
import { NotImplemented, prepareLuauSource, type CheckLuauOptions, type LuauCheckResult, type LuauDiagnostic } from "./typecheckTestHarness";
import { nativeDiagnostic } from "./typecheckNativeDiagnostics";
import { nativeQuery, nativeScopes } from "./typecheckNativeQueries";
import { validateTypeMismatchData, validateNativeCheckEntrypoint } from "./typecheckNativeActions";

export function checkSyntaxOnly(source: string, options: CheckLuauOptions = {}): LuauCheckResult {
  const prepared = prepareLuauSource(source);
  const entry = options.module ?? "MainModule";
  const syntaxDiagnostics = prepared.syntaxDiagnostics.map(error => ({...error,module:entry}));
  const setupSyntaxDiagnostics = Object.entries(options.moduleSources ?? {}).flatMap(([module,text]) =>
    prepareLuauSource(text).syntaxDiagnostics.map(error => ({ ...error, module })));
  const missing = (): never => { throw new NotImplemented("native checking of a parse-only case"); };
  return { ...prepared, syntaxDiagnostics, moduleName:entry, checked: false, diagnostics: syntaxDiagnostics, setupSyntaxDiagnostics,
    typeOf: missing, find: missing, decoratedSource: missing };
}

/** One actual fixture, prepared asynchronously by the registered case's caller. */
export function nativeCaseChecker(
  fixture: NativeFixture, flags: Record<string, boolean> = {}, limits: Record<string, number> = {},
  initialize = nativeCaseSetup(fixture,flags,limits),
): (source: string, options?: CheckLuauOptions) => LuauCheckResult {
  return (source, options = {}) => {
    validateNativeCheckEntrypoint(options);
    const prepared = prepareLuauSource(source), preset = options.fixture ?? "Fixture";
    const nativePreset = initialize(preset);
    if (options.solverOverride !== undefined) {
      if (options.solverOverride !== "New") throw Error("Unsupported case-body solver override");
      fixture.selectNewSolver(options.solverOverride);
    }
    if (options.clearModules) fixture.clearFrontend();
    if (options.hiddenTypes) fixture.hiddenTypes();
    if (options.retainFullTypeGraphs === false) fixture.retainGraphs(false);
    for (const definition of options.definitions ?? []) fixture.definition(definition);
    for (const [name,builtin] of Object.entries(options.globals ?? {})) {
      // Audited typed-global recipes select real builtin TypeIds, never parse
      // a made-up type string into a source declaration or infer an answer.
      const selected = (["number","string","boolean","any","nil","error","unknown","never","function","table"] as const)
        .find(selector => selector === builtin);
      if (selected === undefined)
        throw new NotImplemented("the native typed-global recipe requires an explicit supported builtin selector");
      fixture.bindGlobal(name,fixture.builtin(fixture.context(),selected));
    }
    const entry = options.module ?? "MainModule";
    if (Object.hasOwn(options.moduleSources ?? {},entry)) throw Error("entry module is duplicated in moduleSources");
    const setupSyntaxDiagnostics = [];
    const compilerMessages = [...prepared.compilerMessages];
    for (const [module,text] of Object.entries(options.moduleSources ?? {})) {
      const dependency = prepareLuauSource(text);
      setupSyntaxDiagnostics.push(...dependency.syntaxDiagnostics.map(error => ({ ...error,module })));
      compilerMessages.push(...dependency.compilerMessages);
      fixture.source(module,text);
    }
    // Raw fixture parsing is an independent required proof. The canonical
    // converter AST remains intact for the separate public production path.
    fixture.source(entry,source);
    const result = options.entrypoint === "module"
      ? nativePreset === "NonStrictTypeCheckerFixture" ? fixture.checkNonStrictModule(entry,nonStrictDefinitions) : fixture.checkModule(entry)
      : nativePreset === "NonStrictTypeCheckerFixture" ? fixture.checkNonStrict(entry,nonStrictDefinitions) : fixture.check(entry,options.mode ?? "strict");
    const diagnostics = result.diagnostics.map(error => nativeDiagnostic(fixture,result,error));
    const originalIndices = new Map(diagnostics.map((error,position) => [error as LuauDiagnostic,{
      position,index:error.nativeIndex,message:error.message,module:error.module,
      fields:error.fields,dataGetter:Object.getOwnPropertyDescriptor(error,"data")?.get,
    }]));
    const selectedIndices = (selected: readonly LuauDiagnostic[]) => {
      const current = fixture.context();
      if (current.instance !== result.instance || current.session !== result.session || current.revision !== result.revision)
        throw Error("Stale native diagnostic result");
      let previous = -1;
      return selected.map(error => {
        const original = originalIndices.get(error);
        if (!original || original.position <= previous || error.nativeIndex !== original.index)
          throw Error("Foreign native diagnostic selection: duplicate, reordered or mutated wrapper");
        previous = original.position;
        const actual = fixture.errorFacts(result,original.index);
        if (actual.kind !== error.code || actual.begin.line !== error.line || actual.begin.column !== error.column ||
            actual.end.line !== error.endLine || actual.end.column !== error.endColumn || actual.module !== error.module ||
            error.message !== original.message || error.module !== original.module || error.fields !== original.fields ||
            Object.getOwnPropertyDescriptor(error,"data")?.get !== original.dataGetter)
          throw Error("Mutated native diagnostic wrapper");
        return original.index;
      });
    };
    const find: LuauCheckResult["find"] = (selector, selectedDiagnostics = diagnostics) => {
      const indices = selectedIndices(selectedDiagnostics);
      return nativeQuery(fixture,result,entry,selector,indices);
    };
    return { syntaxDiagnostics: prepared.syntaxDiagnostics.map(error => ({...error,module:entry})), checked: true, diagnostics, compilerMessages, setupSyntaxDiagnostics,
      moduleName: entry, find, typeOf: (name,options) => find({type:name}).print(options),
      decoratedSource: () => fixture.decorated(result,entry), scopes: nativeScopes(fixture,result,entry),
      moduleGraph: module => fixture.moduleFacts(result,module),
      moduleDiagnostics: module => fixture.moduleDiagnostics(result,module),
      diagnosticAtBegin: (begin,selected = diagnostics) => {
        if (!Array.isArray(begin) || begin.length !== 2 || !begin.every(part => Number.isSafeInteger(part) && part >= 0 && part <= 2147483647))
          throw Error("Invalid native diagnostic begin position");
        const indices = selectedIndices(selected);
        if (selected === diagnostics) {
          const original = fixture.firstErrorAt(result,begin[0],begin[1]);
          const wrapper = diagnostics.find(error => error.nativeIndex === original);
          if (!wrapper) throw Error("Missing original native diagnostic wrapper");
          return wrapper;
        }
        // A filtered result preserves actual source order, wrapper identity and
        // native indices. Select by actual native fields, never a cached message.
        for (const [offset,index] of indices.entries()) {
          const actual = fixture.errorFacts(result,index);
          if (actual.begin.line === begin[0] && actual.begin.column === begin[1]) return selected[offset]!;
        }
        throw Error("No native diagnostic at requested begin position");
      },
      mismatchDataEquals: (diagnostic,assertion) => {
        validateTypeMismatchData(assertion);
        const original = selectedIndices([diagnostic])[0]!;
        return fixture.mismatchEquals(result,original,fixture.builtin(result,assertion.wanted),fixture.builtin(result,assertion.given));
      } };
  };
}

/** Shared one-case setup for definition actions and checks; construction precedes body flags. */
export function nativeCaseSetup(fixture: NativeFixture, flags: Record<string, boolean> = {}, limits: Record<string, number> = {}) {
  let originalPreset: string | undefined;
  let nativePreset: FixturePreset;
  return (preset: string): FixturePreset => {
    if (originalPreset && originalPreset !== preset) throw Error("shared native fixture session cannot change fixture");
    if (!originalPreset) {
      // Exact TypeStateFixture is BuiltinsFixture plus the native forced-new baseline.
      const selected = preset === "TypeStateFixture" ? "BuiltinsFixture" : preset;
      if (!["Fixture","BuiltinsFixture","NonStrictTypeCheckerFixture","ExternTypeFixture","ExternExplicitNewFixture","RefinementExternTypeFixture","ClassesFixture","NegationFixture","IsSubtypeFixture"].includes(selected))
        throw new NotImplemented("the exact native fixture " + preset);
      fixture.create(selected as FixturePreset);
      for (const [name,value] of Object.entries(flags)) fixture.flag(name,value);
      for (const [name,value] of Object.entries(limits)) fixture.flag(name,value);
      originalPreset = preset; nativePreset = selected as FixturePreset;
    }
    return nativePreset!;
  };
}
