import type { CheckedType, LocationTuple, LuauToStringOptions, PackFacts, TypePathStep, TypeSelector } from "./typecheckTestHarness";
import { LUAU_PRIMITIVE_KINDS } from "./typecheckTestHarness";
import type { NativeCheck, NativeFixture, NativeLocation, NativeTypeFun, PackHandle, TypeHandle } from "../analysis-backend/native-conformance/nativeFixture";

type Selected = TypeHandle | PackHandle;
const isPack = (value: Selected): value is PackHandle => "pack" in value;
const typeKinds: Record<string, string> = {
  table: "TableType", extern: "ExternType", function: "FunctionType", generic: "GenericType",
  union: "UnionType", metatable: "MetatableType", primitive: "PrimitiveType",
};
const packKinds: Record<string, string> = { pack: "TypePack", variadic: "VariadicTypePack", generic: "GenericTypePack" };
const nativeKinds = new Set(["BoundType", "ErrorType", "FreeType", "GenericType", "PrimitiveType", "SingletonType",
  "BlockedType", "PendingExpansionType", "FunctionType", "TableType", "MetatableType", "ExternType", "AnyType",
  "UnionType", "IntersectionType", "LazyType", "UnknownType", "NeverType", "NegationType", "NoRefineType", "TypeFunctionInstanceType",
  "BoundTypePack", "ErrorTypePack", "FreeTypePack", "GenericTypePack", "TypePack", "VariadicTypePack", "BlockedTypePack", "TypeFunctionInstanceTypePack"]);
const exactKind = (value: string): string => {
  const kind = typeKinds[value] ?? packKinds[value] ?? value;
  if (!nativeKinds.has(kind)) throw Error("Invalid native variant predicate: " + value);
  return kind;
};
const tuple = (span: NativeLocation): LocationTuple => [span.begin.line, span.begin.column, span.end.line, span.end.column];

/** Preserves raw identity. Printing and kind predicates use their native follow operations. */
export class NativeCheckedType implements CheckedType {
  constructor(readonly fixture: NativeFixture, readonly handle: Selected, private readonly declared?: NativeTypeFun) {}
  private type(): TypeHandle {
    if (isPack(this.handle)) throw Error("Native operation requires a type rather than a pack");
    return this.handle;
  }
  private peer(other: CheckedType): NativeCheckedType {
    if (!(other instanceof NativeCheckedType) || other.fixture !== this.fixture)
      throw Error("Native query comparison requires the same fixture instance");
    return other;
  }
  print(options: LuauToStringOptions = {}): string {
    return this.fixture.printedOptions(this.handle, options);
  }
  get kind(): string {
    const facts = isPack(this.handle) ? this.fixture.packFacts(this.handle, false) : this.fixture.facts(this.handle);
    return exactKind("direct" in facts ? (facts.direct ? "TypePack" : facts.tailKind) : facts.kind);
  }
  is(other: CheckedType): boolean {
    const right = this.peer(other).handle;
    if (isPack(this.handle)) return isPack(right) && this.fixture.identicalPack(this.handle, right);
    return !isPack(right) && this.fixture.identical(this.handle, right);
  }
  follow(): NativeCheckedType {
    return new NativeCheckedType(this.fixture, isPack(this.handle) ? this.fixture.followPack(this.handle) : this.fixture.follow(this.handle));
  }
  subtypeOf(other: CheckedType): boolean { return this.fixture.subtypeOf(this.type(), this.peer(other).type()); }
  inArena(arena: "interface" | "global", module: string): boolean { return this.fixture.inArena(this.type(),arena,module); }
  private functionFacts(direction: "arguments" | "returns", flattened: boolean): PackFacts | undefined {
    if (isPack(this.handle) && direction !== "returns") return undefined;
    if (!isPack(this.handle) && this.fixture.facts(this.handle).kind !== "function") return undefined;
    const pack = isPack(this.handle) ? this.fixture.packFacts(this.handle, flattened) : this.fixture.functionPack(this.handle, direction, flattened);
    const hasTail = typeof pack.tail === "boolean" ? pack.tail : pack.tail !== null;
    const tailKind = hasTail && (flattened || pack.direct) ? exactKind(pack.tailKind) : undefined;
    return { length: flattened || pack.direct ? pack.head.length : undefined,
      tail: flattened || pack.direct ? hasTail : undefined, tailKind };
  }
  get arguments(): PackFacts | undefined { return this.functionFacts("arguments", false); }
  get returns(): PackFacts | undefined { return this.functionFacts("returns", false); }
  get flattenedArguments(): PackFacts | undefined { return this.functionFacts("arguments", true); }
  get flattenedReturns(): PackFacts | undefined { return this.functionFacts("returns", true); }
  get results(): CheckedType[] | undefined {
    if (!isPack(this.handle) && this.fixture.facts(this.handle).kind !== "function") return undefined;
    const pack = isPack(this.handle) ? this.fixture.packFacts(this.handle, true) : this.fixture.functionPack(this.handle, "returns", true);
    return pack.head.map(type => new NativeCheckedType(this.fixture, type));
  }
  get propertyCount(): number | undefined {
    const facts = this.fixture.facts(this.type());
    return facts.kind === "table" || facts.kind === "extern" ? facts.ownProperties : undefined;
  }
  get tableState(): import("./typecheckTestHarness").LuauTableState {
    const selected = this.type();
    if (!this.fixture.facts(selected).rawTable) throw Error("Native table state requires a raw TableType");
    const state = this.fixture.tableState(selected);
    const states = ["Sealed", "Unsealed", "Free", "Generic"] as const;
    if (state === null || !Number.isSafeInteger(state) || state < 0 || state >= states.length)
      throw Error("Invalid native TableState discriminant");
    return states[state]!;
  }
  get primitive(): import("./typecheckTestHarness").LuauPrimitiveKind | undefined {
    const facts = this.fixture.facts(this.type());
    if (facts.kind !== "primitive") return undefined;
    const names = LUAU_PRIMITIVE_KINDS;
    if (facts.primitive === null || names[facts.primitive] === undefined) throw Error("Invalid native primitive discriminant");
    return names[facts.primitive];
  }
  get hasSelf(): boolean | undefined { const facts = this.fixture.facts(this.type()); return facts.kind === "function" ? facts.hasSelf : undefined; }
  get genericCount(): number | undefined { const facts = this.fixture.facts(this.type()); return facts.kind === "function" ? facts.generics : undefined; }
  get genericPackCount(): number | undefined { const facts = this.fixture.facts(this.type()); return facts.kind === "function" ? facts.genericPacks : undefined; }
  get instantiatedTypeParameterCount(): number | undefined { const facts = this.fixture.facts(this.type()); return facts.kind === "table" ? facts.typeParameters : undefined; }
  get instantiatedTypePackParameterCount(): number | undefined { const facts = this.fixture.facts(this.type()); return facts.kind === "table" ? facts.packParameters : undefined; }
  get typeParameterCount(): number | undefined {
    // Validation is still required when only querying retained metadata.
    this.fixture.facts(this.type());
    return this.declared?.parameters.length;
  }
  get name(): string | undefined { return this.fixture.facts(this.type()).name ?? undefined; }
  get definitionLocation(): LocationTuple | undefined {
    const facts = this.fixture.facts(this.type());
    if (this.declared) return this.declared.definitionLocation ? tuple(this.declared.definitionLocation) : undefined;
    return facts.definition ? [facts.definition.begin.line, facts.definition.begin.column, facts.definition.end.line, facts.definition.end.column] : undefined;
  }
  get propertyNames(): string[] | undefined {
    const facts = this.fixture.facts(this.type());
    return facts.kind === "table" || facts.kind === "extern" ? this.fixture.propertyNames(this.type()) : undefined;
  }
  get propertyLocations(): CheckedType["propertyLocations"] {
    const names = this.propertyNames;
    if (!names) return undefined;
    return Object.fromEntries(names.map(name => {
      const facts = this.fixture.propertyFacts(this.type(), name);
      return [name, { location: facts.location ? tuple(facts.location) : null, typeLocation: facts.typeLocation ? tuple(facts.typeLocation) : null }];
    }));
  }
  get polarity(): string | undefined {
    const facts = this.fixture.facts(this.type());
    if (facts.kind !== "generic") return undefined;
    // Pinned Polarity.h: None, Positive, Negative, Mixed, Unknown.
    const value = facts.polarity === null ? undefined : ["None", "Positive", "Negative", "Mixed", "Unknown"][facts.polarity];
    if (value === undefined) throw Error("Invalid native GenericType polarity");
    return value;
  }
}

/** Explicit paths stay bounded; no graph transfer or printed-text interpretation. */
function stepInto(fixture: NativeFixture, selected: Selected, step: TypePathStep): Selected {
  if (isPack(selected)) {
    if (!("result" in step)) throw Error("Native pack path requires a result index");
    const type = fixture.packFacts(selected, true).head[step.result];
    if (!type) throw Error("Absent native flattened pack result");
    return type;
  }
  if ("property" in step) {
    // A shared property selector searches actual extern parents. The primitive
    // child API remains an own-property observation; tables/metatables do not
    // acquire implicit parent or metatable unwrapping behavior.
    if (fixture.facts(selected).kind !== "extern") return fixture.child(selected, "read", step.property);
    const seen: TypeHandle[] = [];
    let current = selected;
    for (let depth = 0; depth < 256; depth++) {
      const followed = fixture.follow(current);
      if (seen.some(previous => fixture.identical(previous, followed))) throw Error("Cyclic native extern parent query");
      seen.push(followed);
      if (fixture.propertyNames(followed).includes(step.property)) return fixture.child(followed, "read", step.property);
      current = fixture.child(followed, "parent");
    }
    throw Error("Native extern parent query limit");
  }
  if ("indexer" in step) return fixture.child(selected, step.indexer === "key" ? "index" : "indexResult");
  if ("generic" in step) return fixture.child(selected, "generic", "", step.generic);
  if ("genericPack" in step) return fixture.selectedPack(selected, "genericPack", step.genericPack);
  if ("instantiatedTypeParameter" in step) return fixture.child(selected, "typeParameter", "", step.instantiatedTypeParameter);
  if ("instantiatedTypePackParameter" in step) return fixture.selectedPack(selected, "packParameter", step.instantiatedTypePackParameter);
  if ("typeParameter" in step) throw Error("Native declared TypeFun parameter query is not implemented");
  const direction = "argument" in step ? "arguments" : "returns";
  const index = "argument" in step ? step.argument : step.result;
  const type = fixture.functionPack(selected, direction, true).head[index];
  if (!type) throw Error("Absent native flattened function pack entry");
  return type;
}

export function nativeQuery(
  fixture: NativeFixture, result: NativeCheck, entry: string, selector: TypeSelector,
  diagnosticIndices: readonly number[] = result.diagnostics.map(error => error.nativeIndex),
): NativeCheckedType {
  const module = selector.module ?? entry;
  let selected: Selected;
  let declared: NativeTypeFun | undefined;
  if ("type" in selector) selected = selector.module ? fixture.binding(result, module, selector.type) : fixture.mainType(result, selector.type);
  else if ("global" in selector) selected = fixture.global(result, selector.global);
  else if ("alias" in selector || "exportedAlias" in selector || "importedAlias" in selector) {
    declared = "alias" in selector ? fixture.typeFun(result, module, selector.alias)
      : "exportedAlias" in selector ? fixture.typeFun(result, module, selector.exportedAlias, "exported")
      : fixture.typeFun(result, module, selector.importedAlias[1], "imported", selector.importedAlias[0]);
    selected = declared.type;
  }
  else if ("builtin" in selector) {
    const name = selector.builtin;
    selected = fixture.builtin(result, name);
  } else if ("moduleReturn" in selector) selected = fixture.modulePack(result, module);
  else if ("typeAt" in selector) selected = fixture.positionType(result, module, ...selector.typeAt);
  else if ("expectedTypeAt" in selector) selected = fixture.positionType(result, module, ...selector.expectedTypeAt, true);
  else if ("overloadAt" in selector) {
    const overload = fixture.overloadAt(result, module, ...selector.overloadAt);
    if (!overload.expression || !overload.call || !overload.resolved) throw Error("Absent native resolved call overload");
    selected = overload.resolved;
  } else {
    const [index, field] = selector.diagnosticType;
    if (selector.module) throw Error("Native module-qualified diagnostic sequence is not implemented");
    const original = diagnosticIndices[index];
    if (original === undefined) throw Error("Invalid filtered native diagnostic index");
    const facts = fixture.errorFacts(result, original);
    const nativeField = facts.kind === "TypeMismatch" ? field === "wantedType" ? "wanted" : field === "givenType" ? "given" : field
      : facts.kind === "TypePackMismatch" ? field === "wantedTp" ? "wanted" : field === "givenTp" ? "given" : field : field;
    const value = facts.types[nativeField] ?? facts.packs[nativeField];
    if (!value) throw Error("Absent native diagnostic type or pack field: " + field);
    selected = value;
  }
  for (const step of selector.path ?? []) {
    if ("typeParameter" in step) {
      if (!declared) throw Error("Native declared parameter requires a TypeFun selector");
      const parameter = declared.parameters[step.typeParameter];
      if (!parameter) throw Error("Absent native declared type parameter");
      selected = parameter.type;
    } else selected = stepInto(fixture, selected, step);
    declared = undefined;
  }
  if (selector.normalized) {
    if (isPack(selected)) throw Error("Native normalization requires a type rather than a pack");
    selected = fixture.normalized(selected);
  }
  return new NativeCheckedType(fixture, selected, declared);
}

export function nativeScopes(fixture: NativeFixture, result: NativeCheck, module: string) {
  return fixture.scopes(result, module).map(scope => ({ location: tuple(scope.location), imports: scope.imports,
    aliases: Object.fromEntries(Object.entries(scope.aliases).map(([name,span]) => [name,tuple(span)])) }));
}
