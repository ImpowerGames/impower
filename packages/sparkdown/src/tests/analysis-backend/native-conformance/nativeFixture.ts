/** Test-only host boundary: all observations below come from real native fixture values. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const PIN = "7d5f73364fdbbaa984fa545071630eba73cfea98";
const nativeRoot = new URL("../../../../native/luau-conformance/", import.meta.url);
type NativeModule = {
  ccall(name: string, result: "string" | "number" | null, types: string[], values: number[]): unknown;
  writeArrayToMemory(bytes: Uint8Array, pointer: number): void;
};
type Manifest = {
  abi: number;
  instrumentation: string;
  pin: string;
  version: string;
  ownedHashes: Record<string, string>;
  artifacts: Record<string, { sha256: string; bytes: number }>;
};
export interface ResultHandle { readonly instance: symbol; session: number; revision: number }
export interface TypeHandle extends ResultHandle { index: number }
export interface PackHandle extends ResultHandle { index: number; pack: true }
export interface CaptureHandle { readonly instance: symbol; session: number; environment: number; index: number }
export interface NativeDiagnostic {
  module: string; code: number; message: string;
  /** Original native result.errors index, preserved when a caller filters diagnostics. */
  nativeIndex: number;
  /** Native upstream byte columns, deliberately distinct from the production UTF-16 contract. */
  begin: { line: number; column: number };
  end: { line: number; column: number };
  /** Actual native TypeErrorData variant name, independent of numeric code/message. */
  kind: string;
  checkedFunctionName?: string;
  argumentIndex?: number;
  functionName?: string;
  argument?: string;
}
export interface NativeCheck extends ResultHandle {
  diagnostics: NativeDiagnostic[];
  effectiveFlags: { name: string; value: boolean | number }[];
}
/** Actual Module.errors vector positions are unrelated to aggregate nativeIndex. */
export interface NativeModuleDiagnostic extends Omit<NativeDiagnostic,"nativeIndex"> { moduleIndex: number }
export interface NativeModuleDiagnostics { module: string; diagnostics: NativeModuleDiagnostic[] }
export type FixturePreset = "Fixture" | "BuiltinsFixture" | "NonStrictTypeCheckerFixture" | "ExternTypeFixture" | "ExternExplicitNewFixture" | "RefinementExternTypeFixture" | "ClassesFixture" | "NegationFixture" | "IsSubtypeFixture";
export interface TypeFacts {
  kind: string; documentation: string | null; ownProperties: number;
  hasSelf: boolean; generics: number; genericPacks: number; typeParameters: number; packParameters: number;
  polarity: number | null; primitive: number | null; rawTable: boolean;
  /** The original TypeId bit, before following a Bound wrapper. */
  rawPersistent: boolean;
  /** Actual followed TableType metadata; inapplicable or absent fields stay null. */
  tableLevel: [number,number] | null;
  tableScopeIsGlobal: boolean | null;
  indexerIsReadOnly: boolean | null;
  name: string | null;
  definitionModuleName: string | null;
  definition: { module: string | null; begin: { line: number; column: number }; end: { line: number; column: number };
    nameBegin: { line: number; column: number }; nameEnd: { line: number; column: number }; varargPresent: boolean } | null;
}
export type NativeLocation = { begin: { line: number; column: number }; end: { line: number; column: number } };
export interface NativeTypeFun {
  type: TypeHandle;
  parameters: { type: TypeHandle; default: TypeHandle | null }[];
  packParameters: { type: PackHandle; default: PackHandle | null }[];
  definitionLocation: NativeLocation | null;
}
export type NativeMode = "nonstrict" | "strict" | "nocheck";
export interface NativePrintOptions {
  exhaustive?: boolean; useLineBreaks?: boolean; functionTypeArguments?: boolean; hideTableKind?: boolean;
  hideNamedFunctionTypeParameters?: boolean; hideFunctionSelfArgument?: boolean; hideTableAliasExpansions?: boolean;
  useQuestionMarks?: boolean; ignoreSyntheticName?: boolean;
  maxTableLength?: number;
}
type Observation = {
  status: string; message?: string; success?: boolean; parseErrors?: unknown[];
  index?: number; printed?: string; identical?: boolean; state?: number | null; equal?: boolean;
  [key: string]: unknown;
};
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function loadNativeFixture(): Promise<NativeFixture> {
  // Missing or stale artifacts fail explicitly; these tests never silently skip native execution.
  const generated = new URL("generated/", nativeRoot);
  const manifest: Manifest = JSON.parse(await readFile(new URL("manifest.json", generated), "utf8"));
  if (manifest.abi !== 1 || manifest.instrumentation !== "native-fixture-only" || manifest.pin !== PIN ||
      !manifest.version.includes("4.0.10")) throw Error("Invalid native conformance build provenance");
  for (const path of ["session.h", "session.cpp", "bridge.cpp", "fixture-runtime.cpp", "build.mjs"])
    if (sha256(await readFile(new URL(path, nativeRoot))) !== manifest.ownedHashes[path])
      throw Error(`Stale native conformance build input: ${path}`);
  const files = new Map<string, Buffer>();
  for (const path of ["backend.js", "backend.wasm", "LICENSE.txt"]) {
    const bytes = await readFile(new URL(path, generated));
    const artifact = manifest.artifacts[path];
    if (!artifact || bytes.byteLength !== artifact.bytes || sha256(bytes) !== artifact.sha256)
      throw Error(`Invalid native conformance artifact: ${path}`);
    files.set(path, bytes);
  }
  const url = pathToFileURL(fileURLToPath(new URL("backend.js", generated))).href;
  const factory = (await import(/* @vite-ignore */ url)).default as (options: { wasmBinary: Buffer }) => Promise<NativeModule>;
  return new NativeFixture(await factory({ wasmBinary: files.get("backend.wasm")! }));
}

export class NativeFixture {
  private disposed = false;
  private readonly instance = Symbol("native fixture WASM instance");
  constructor(private readonly module: NativeModule) {}
  private handle(value: ResultHandle | CaptureHandle): number {
    if (this.disposed) throw Error("Disposed native fixture host");
    if (value.instance !== this.instance) throw Error("Foreign native fixture handle");
    return value.session;
  }
  /** Return error classifications as data so tests can assert the real native exception kind. */
  observe(operation: string, ...args: (string | number)[]): Observation {
    if (this.disposed) throw Error("Disposed native fixture host");
    const allocations: number[] = [];
    try {
      const values = args.map(value => {
        if (typeof value === "number") {
          if (!Number.isSafeInteger(value)) throw Error("Invalid numeric native argument");
          return value;
        }
        if (value.includes("\0")) throw Error("Native source contains embedded NUL");
        const bytes = new TextEncoder().encode(value + "\0");
        const pointer = this.module.ccall("fixture_allocate", "number", ["number"], [bytes.length]) as number;
        if (!pointer) throw Error("Native fixture input allocation failed");
        allocations.push(pointer);
        this.module.writeArrayToMemory(bytes, pointer);
        return pointer;
      });
      return JSON.parse(this.module.ccall(`fixture_${operation}`, "string", values.map(() => "number"), values) as string);
    } finally {
      for (const pointer of allocations) this.module.ccall("fixture_free", null, ["number"], [pointer]);
    }
  }
  private ok(operation: string, ...args: (string | number)[]): Observation {
    const result = this.observe(operation, ...args);
    if (result.status !== "ok") throw Error(`${result.status}: ${result.message ?? operation}`);
    return result;
  }
  flag(name: string, value: boolean | number, lifetime: "initialization" | "case" = "case"): void {
    if (typeof value === "number" && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647))
      throw Error("Native fastint must fit signed32bit integer");
    this.ok("flag", name, typeof value === "boolean" ? 0 : 1, typeof value === "boolean" ? Number(value) : value,
      lifetime === "initialization" ? 1 : 0);
  }
  clearFlags(): void { this.ok("clear_flags"); }
  heapBytes(): number { return this.ok("heap_bytes")["bytes"] as number; }
  flagValue(name: string): boolean | number { return this.ok("flag_value", name)["value"] as boolean | number; }
  scopedFlagValue(name: string): boolean | number { return this.ok("flag_value_scoped", name)["value"] as boolean | number; }
  create(preset: FixturePreset): void {
    this.ok("create", ["Fixture", "BuiltinsFixture", "NonStrictTypeCheckerFixture", "ExternTypeFixture", "ExternExplicitNewFixture", "RefinementExternTypeFixture", "ClassesFixture", "NegationFixture", "IsSubtypeFixture"].indexOf(preset));
  }
  source(module: string, source: string, type: "module" | "script" | "none" = "module"): void {
    this.ok("source", module, source, ["none", "module", "script"].indexOf(type));
  }
  definition(source: string): void {
    if (!this.ok("definition", source).success) throw Error("Native definition load failed");
  }
  /** Actual original ExternTypeFixture case-body transition, under queued flags. */
  selectNewSolver(mode: "New"): void { this.ok("select_new_solver",mode); }
  /** Exact upstream pre-check addGlobalBinding with its @test package. */
  bindGlobal(name: string, type: TypeHandle): void {
    this.ok("bind_global", this.handle(type), type.revision, type.index, name);
  }
  /** Pinned Fixture::isInArena compares the raw TypeId, without implicit follow. */
  inArena(type: TypeHandle, arena: "interface" | "global", module = "MainModule"): boolean {
    return this.ok("in_arena", this.handle(type), type.revision, type.index, arena, module)["present"] as boolean;
  }
  check(module: string, mode: NativeMode = "strict"): NativeCheck {
    return { ...this.ok("check", module, ["nocheck", "nonstrict", "strict"].indexOf(mode)), instance: this.instance } as unknown as NativeCheck;
  }
  checkNonStrict(module: string, exactDefinitions: string): NativeCheck {
    return { ...this.ok("check_nonstrict", module, exactDefinitions), instance: this.instance } as unknown as NativeCheck;
  }
  checkModule(module: string): NativeCheck {
    return { ...this.ok("check_module", module), instance: this.instance } as unknown as NativeCheck;
  }
  checkNonStrictModule(module: string, exactDefinitions: string): NativeCheck {
    return { ...this.ok("check_nonstrict_module", module, exactDefinitions), instance: this.instance } as unknown as NativeCheck;
  }
  /** Exact once-only case-body recipe; observes void completion, not definition status. */
  nonStrictBuiltinGlobals(): void { this.ok("nonstrict_builtin_globals"); }
  binding(result: ResultHandle, module: string, name: string): TypeHandle {
    return { ...result, index: this.ok("binding", this.handle(result), result.revision, module, name).index as number };
  }
  builtin(result: ResultHandle, name: "number" | "string" | "boolean" | "any" | "nil" | "error" | "unknown" | "never" | "function" | "table"): TypeHandle {
    return { ...result, index: this.ok("builtin", this.handle(result), result.revision, name).index as number };
  }
  synthetic(kind: "cyclicUnion" | "asymmetricExtern" | "variadicFunctions"): void { this.ok("synthetic", kind); }
  hiddenTypes(): void { this.ok("hidden_types"); }
  retainGraphs(enabled: boolean): void { this.ok("retain_graphs", Number(enabled)); }
  clearFrontend(): void { this.ok("clear_frontend"); }
  /** Native environment context before a check, for ordered definition observations. */
  context(): ResultHandle { return { ...this.ok("context"), instance: this.instance } as unknown as ResultHandle; }
  mainType(result: ResultHandle, name: string): TypeHandle {
    return { ...result, index: this.ok("main_type", this.handle(result), result.revision, name).index as number };
  }
  positionType(result: ResultHandle, module: string, line: number, column: number, expected = false): TypeHandle {
    return { ...result, index: this.ok("position_type", this.handle(result), result.revision, module, line, column, Number(expected)).index as number };
  }
  globalAlias(result: ResultHandle, name: string): TypeHandle {
    return { ...result, index: this.ok("global_alias", this.handle(result), result.revision, name).index as number };
  }
  bindingFacts(result: ResultHandle, name: string): { documentation: string | null; begin: unknown; end: unknown } {
    return this.ok("binding_facts", this.handle(result), result.revision, name) as unknown as ReturnType<NativeFixture["bindingFacts"]>;
  }
  moduleFacts(result: ResultHandle, module: string): { name: string; humanReadableName: string; internalNodes: number; interfaceNodes: number;
    checkedInNewSolver: boolean; effectiveNewSolver: boolean; timeout: boolean; cancelled: boolean } {
    return this.ok("module_facts", this.handle(result), result.revision, module) as unknown as ReturnType<NativeFixture["moduleFacts"]>;
  }
  moduleDiagnostics(result: ResultHandle, module: string): NativeModuleDiagnostics {
    if (!module || module.length > 4096 || module.includes("\0")) throw Error("Invalid native module selection");
    return this.ok("module_diagnostics",this.handle(result),result.revision,module) as unknown as NativeModuleDiagnostics;
  }
  overloadAt(result: ResultHandle, module: string, line: number, column: number):
    { ancestry: number; expression: boolean; call: boolean; resolved: TypeHandle | null } {
    const facts = this.ok("overload_at", this.handle(result), result.revision, module, line, column);
    return { ancestry: facts["ancestry"] as number, expression: facts["expression"] as boolean, call: facts["call"] as boolean,
      resolved: facts["resolvedIndex"] === null ? null : { ...result, index: facts["resolvedIndex"] as number } };
  }
  decorated(result: ResultHandle, module: string): string {
    return this.ok("decorated", this.handle(result), result.revision, module)["decorated"] as string;
  }
  alias(result: ResultHandle, module: string, name: string): TypeHandle {
    return { ...result, index: this.ok("alias", this.handle(result), result.revision, module, name).index as number };
  }
  typeFun(result: ResultHandle, module: string, name: string, lookup: "ordinary" | "exported" | "imported" = "ordinary", prefix = ""): NativeTypeFun {
    const facts = this.ok("type_fun", this.handle(result), result.revision, module, name, lookup, prefix);
    const type = (index: number): TypeHandle => ({ ...result, index });
    const pack = (index: number): PackHandle => ({ ...result, index, pack: true });
    const parameters = facts["parameters"] as { index: number; default: number | null }[];
    const packs = facts["packParameters"] as { index: number; default: number | null }[];
    return { type: type(facts.index!), definitionLocation: facts["definitionLocation"] as NativeLocation | null,
      parameters: parameters.map(value => ({ type: type(value.index), default: value.default === null ? null : type(value.default) })),
      packParameters: packs.map(value => ({ type: pack(value.index), default: value.default === null ? null : pack(value.default) })) };
  }
  scopes(result: ResultHandle, module: string): { location: NativeLocation; imports: Record<string, string>; aliases: Record<string, NativeLocation> }[] {
    return this.ok("scopes", this.handle(result), result.revision, module)["scopes"] as ReturnType<NativeFixture["scopes"]>;
  }
  global(result: ResultHandle, name: string): TypeHandle {
    return { ...result, index: this.ok("global", this.handle(result), result.revision, name).index as number };
  }
  child(type: TypeHandle, selector: "read" | "write" | "index" | "indexResult" | "parent" | "metatable" | "table" | "option" | "generic" | "typeParameter",
    name = "", index = 0): TypeHandle {
    return { ...type, index: this.ok("child", this.handle(type), type.revision, type.index, selector, name, index).index as number };
  }
  facts(type: TypeHandle): TypeFacts {
    return this.ok("facts", this.handle(type), type.revision, type.index) as unknown as TypeFacts;
  }
  propertyNames(type: TypeHandle): string[] {
    return this.ok("property_names", this.handle(type), type.revision, type.index)["names"] as string[];
  }
  propertyFacts(type: TypeHandle, name: string): { readable: boolean; writable: boolean; documentation: string | null;
    location: NativeLocation | null; typeLocation: NativeLocation | null } {
    return this.ok("property_facts", this.handle(type), type.revision, type.index, name) as unknown as ReturnType<NativeFixture["propertyFacts"]>;
  }
  errorType(result: ResultHandle, index: number, direction: "wanted" | "given"): TypeHandle {
    return { ...result, index: this.ok("error_type", this.handle(result), result.revision, index, Number(direction === "wanted")).index as number };
  }
  functionPack(type: TypeHandle, direction: "arguments" | "returns", flattened: boolean):
    { direct: boolean; head: TypeHandle[]; tail: boolean; tailKind: string } {
    const facts = this.ok("function_pack", this.handle(type), type.revision, type.index, Number(direction === "arguments"), Number(flattened));
    return { direct: facts["direct"] as boolean, tail: facts["tail"] as boolean, tailKind: facts["tailKind"] as string,
      head: (facts["head"] as number[]).map(index => ({ ...type, index })) };
  }
  modulePack(result: ResultHandle, module: string): PackHandle {
    return { ...result, pack: true, index: this.ok("module_pack", this.handle(result), result.revision, module).index as number };
  }
  selectedPack(type: TypeHandle, selector: "arguments" | "returns" | "genericPack" | "packParameter", index = 0): PackHandle {
    return { ...type, pack: true, index: this.ok("selected_pack", this.handle(type), type.revision, type.index, selector, index).index as number };
  }
  packFacts(pack: PackHandle, flattened: boolean): { direct: boolean; head: TypeHandle[]; tail: PackHandle | null; tailKind: string; size: number; finite: boolean } {
    const facts = this.ok("pack_facts", this.handle(pack), pack.revision, pack.index, Number(flattened));
    return { direct: facts["direct"] as boolean, tailKind: facts["tailKind"] as string, size: facts["size"] as number, finite: facts["finite"] as boolean,
      head: (facts["head"] as number[]).map(index => ({ instance: pack.instance, session: pack.session, revision: pack.revision, index })),
      tail: facts["tailIndex"] === null ? null : { ...pack, index: facts["tailIndex"] as number } };
  }
  printedPack(pack: PackHandle, exhaustive = false): string {
    return this.ok("pack_printed", this.handle(pack), pack.revision, pack.index, Number(exhaustive)).printed as string;
  }
  packFirst(pack: PackHandle): TypeHandle {
    return { instance: pack.instance, session: pack.session, revision: pack.revision, index: this.ok("pack_first", this.handle(pack), pack.revision, pack.index).index as number };
  }
  identicalPack(left: PackHandle, right: PackHandle): boolean {
    this.handle(left); this.handle(right);
    if (left.session !== right.session || left.revision !== right.revision) throw Error("Native pack identity handles have different results");
    return this.ok("pack_identity", left.session, left.revision, left.index, right.index).identical as boolean;
  }
  follow(type: TypeHandle): TypeHandle {
    return { ...type, index: this.ok("follow", this.handle(type), type.revision, type.index, 0).index as number };
  }
  followPack(pack: PackHandle): PackHandle {
    return { ...pack, index: this.ok("follow", this.handle(pack), pack.revision, pack.index, 1).index as number };
  }
  normalized(type: TypeHandle): TypeHandle {
    return { ...type, index: this.ok("normalized", this.handle(type), type.revision, type.index).index as number };
  }
  /** Test-only real BoundType allocation; never used to answer a corpus query. */
  boundControl(type: TypeHandle): TypeHandle {
    return { ...type, index: this.ok("bound_control", this.handle(type), type.revision, type.index, 0).index as number };
  }
  /** Test-only real BoundTypePack allocation; never used to answer a corpus query. */
  boundPackControl(pack: PackHandle): PackHandle {
    return { ...pack, index: this.ok("bound_control", this.handle(pack), pack.revision, pack.index, 1).index as number };
  }
  errorFacts(result: ResultHandle, index: number, nestedDepth = 0): { kind: string; module: string;
    begin: { line: number; column: number }; end: { line: number; column: number };
    fields: Record<string, string | number | boolean>; types: Record<string, TypeHandle>; packs: Record<string, PackHandle>;
    strings: Record<string, string[]>; locations: Record<string, { begin: unknown; end: unknown }>; cycle: string[] } {
    const facts = this.ok("error_facts", this.handle(result), result.revision, index, nestedDepth);
    return { kind: facts["kind"] as string, fields: facts["fields"] as Record<string, string | number | boolean>,
      module: facts["module"] as string, begin: facts["begin"] as { line: number; column: number }, end: facts["end"] as { line: number; column: number },
      types: Object.fromEntries(Object.entries(facts["types"] as Record<string, number>).map(([name, index]) => [name, { ...result, index }])),
      packs: Object.fromEntries(Object.entries(facts["packs"] as Record<string, number>).map(([name, index]) => [name, { ...result, index, pack: true as const }])),
      strings: facts["strings"] as Record<string, string[]>, locations: facts["locations"] as Record<string, { begin: unknown; end: unknown }>,
      cycle: facts["cycle"] as string[] };
  }
  mismatchErrorEquals(result: ResultHandle, index: number, wanted: TypeHandle, given: TypeHandle, location: [number, number, number, number]): boolean {
    this.handle(result); this.handle(wanted); this.handle(given);
    for (const type of [wanted, given])
      if (type.session !== result.session || type.revision !== result.revision) throw Error("Native mismatch handles have different results");
    return this.ok("mismatch_error", result.session, result.revision, index, wanted.index, given.index, ...location).equal as boolean;
  }
  notATableErrorEquals(result: ResultHandle, index: number, expected: TypeHandle, location: [number, number, number, number]): boolean {
    this.handle(result); this.handle(expected);
    if (expected.session !== result.session || expected.revision !== result.revision) throw Error("Native error handles have different results");
    return this.ok("not_table_error", result.session, result.revision, index, expected.index, ...location).equal as boolean;
  }
  firstErrorAt(result: ResultHandle, line: number, column: number): number {
    if (![line,column].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647))
      throw Error("Invalid native diagnostic begin position");
    return this.ok("first_error_at", this.handle(result), result.revision, line, column).index as number;
  }
  printed(type: TypeHandle, exhaustive = false): string {
    return this.ok(exhaustive ? "printed_exhaustive" : "printed", this.handle(type), type.revision, type.index).printed as string;
  }
  identical(left: TypeHandle, right: TypeHandle): boolean {
    this.handle(left); this.handle(right);
    if (left.session !== right.session || left.revision !== right.revision) throw Error("Native identity handles have different results");
    return this.ok("identity", left.session, left.revision, left.index, right.index).identical as boolean;
  }
  printedOptions(type: TypeHandle | PackHandle, options: NativePrintOptions = {}): string {
    const names = ["exhaustive", "useLineBreaks", "functionTypeArguments", "hideTableKind", "hideNamedFunctionTypeParameters",
      "hideFunctionSelfArgument", "hideTableAliasExpansions", "useQuestionMarks", "ignoreSyntheticName"] as const;
    let mask = 128; // Native useQuestionMarks defaults true; other requested bools default false.
    for (const [name, value] of Object.entries(options)) {
      if (name === "maxTableLength") continue;
      const bit = names.indexOf(name as typeof names[number]);
      if (bit < 0 || typeof value !== "boolean") throw Error("Unknown or mistyped native print option");
      if (value) mask |= 1 << bit; else mask &= ~(1 << bit);
    }
    const maximum = options.maxTableLength ?? -1;
    if (options.maxTableLength !== undefined && (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > 2147483647))
      throw Error("Invalid native maximum table print length");
    return this.ok("print_options", this.handle(type), type.revision, type.index, mask, Number("pack" in type), maximum).printed as string;
  }
  subtypeOf(sub: TypeHandle, superType: TypeHandle): boolean {
    this.handle(sub); this.handle(superType);
    if (sub.session !== superType.session || sub.revision !== superType.revision) throw Error("Native subtype handles have different results");
    return this.ok("subtype", sub.session, sub.revision, sub.index, superType.index)["subtype"] as boolean;
  }
  tableState(type: TypeHandle): number | null {
    return this.ok("table_state", this.handle(type), type.revision, type.index).state as number | null;
  }
  mismatchEquals(result: ResultHandle, error: number, wanted: TypeHandle, given: TypeHandle): boolean {
    this.handle(result); this.handle(wanted); this.handle(given);
    for (const type of [wanted, given])
      if (type.session !== result.session || type.revision !== result.revision) throw Error("Native mismatch handles have different results");
    return this.ok("mismatch", result.session, result.revision, error, wanted.index, given.index).equal as boolean;
  }
  capture(global: string, property: string): CaptureHandle {
    return { ...this.ok("capture", global, property), instance: this.instance } as unknown as CaptureHandle;
  }
  captureType(type: TypeHandle): CaptureHandle {
    return { ...this.ok("capture_type", this.handle(type), type.revision, type.index), instance: this.instance } as unknown as CaptureHandle;
  }
  levels(capture: CaptureHandle): { before: [number, number]; after: [number, number] } {
    return this.ok("levels", this.handle(capture), capture.environment, capture.index) as unknown as { before: [number, number]; after: [number, number] };
  }
  capturedType(capture: CaptureHandle, result: ResultHandle): TypeHandle {
    this.handle(capture); this.handle(result);
    if (capture.session !== result.session) throw Error("Native capture and result have different sessions");
    return { ...result, index: this.ok("captured_type", capture.session, capture.environment, capture.index, result.revision).index as number };
  }
  reset(): void { this.ok("reset"); }
  dispose(): void {
    if (this.disposed) return;
    this.ok("dispose"); this.disposed = true;
  }
}
