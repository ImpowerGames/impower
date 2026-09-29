// Luau's type model, ported from `Analysis/include/Luau/Type.h`,
// `TypePack.h` and their `.cpp` files at the commit pinned in
// `src/tests/luau-conformance/upstream/typecheck-cases.json`. Luau is
// MIT-licensed; see `LICENSE-luau.txt` in this directory.
//
// A type is a mutable cell (`Type`) holding one variant; the solver rewrites
// cells in place, most often by binding one to another, so identity is
// object identity and `follow` resolves bindings. Every cell also records the
// order it was created in, which stands in for the allocation address Luau
// orders some sets by.

import type { AstExprCall, AstStatTypeFunction, DeprecatedInfo } from "./Ast";
import type { BuiltinTypeFunctions } from "./BuiltinTypeFunctions";
import type { Constraint } from "./Constraint";
import type { ConstraintSolver } from "./ConstraintSolver";
import type { Location } from "./Location";
import type { Scope } from "./Scope";
import type { TypeChecker2 } from "./TypeChecker2";
import type { TypeFunction, TypePackFunction } from "./TypeFunction";

// ---------------------------------------------------------------------------
// Polarity and levels
// ---------------------------------------------------------------------------

export const enum Polarity {
  None = 0b000,
  Positive = 0b001,
  Negative = 0b010,
  Mixed = 0b011,
  Unknown = 0b100,
}

export function isPositive(p: Polarity): boolean {
  return (p & Polarity.Positive) !== 0;
}

export function isNegative(p: Polarity): boolean {
  return (p & Polarity.Negative) !== 0;
}

export function isKnown(p: Polarity): boolean {
  return p !== Polarity.Unknown;
}

export function invertPolarity(p: Polarity): Polarity {
  switch (p) {
    case Polarity.Positive:
      return Polarity.Negative;
    case Polarity.Negative:
      return Polarity.Positive;
    default:
      return p;
  }
}

export class TypeLevel {
  constructor(
    public level = 0,
    public subLevel = 0,
  ) {}

  subsumes(rhs: TypeLevel): boolean {
    if (this.level < rhs.level) return true;
    if (this.level > rhs.level) return false;
    return this.subLevel === rhs.subLevel;
  }

  subsumesStrict(rhs: TypeLevel): boolean {
    if (this.level === rhs.level && this.subLevel === rhs.subLevel) return false;
    return this.subsumes(rhs);
  }

  incr(): TypeLevel {
    return new TypeLevel(this.level + 1, 0);
  }
}

let nextIndex = 0;
/** Luau's `Unifiable::freshIndex`: a counter shared by free, generic and blocked types. */
export function freshIndex(): number {
  return ++nextIndex;
}

let nextErrorIndex = 0;
let nextBlockedPackIndex = 0;
let nextPendingExpansionIndex = 0;
let nextSerial = 0;

// ---------------------------------------------------------------------------
// Type variants
// ---------------------------------------------------------------------------

export interface BoundType {
  readonly kind: "BoundType";
  boundTo: TypeId;
}

export interface ErrorType {
  readonly kind: "ErrorType";
  index: number;
  synthetic?: TypeId;
}

export interface FreeType {
  readonly kind: "FreeType";
  index: number;
  level: TypeLevel;
  scope: Scope | undefined;
  forwardedTypeAlias: boolean;
  lowerBound: TypeId;
  upperBound: TypeId;
  polarity: Polarity;
  /**
   * Set when the free type stands for a string or boolean literal: it
   * generalizes to its lower-bound singleton when its upper bound narrowed,
   * or to this primitive otherwise.
   */
  primitiveType?: TypeId;
}

export interface GenericType {
  readonly kind: "GenericType";
  index: number;
  level: TypeLevel;
  scope: Scope | undefined;
  name: string;
  explicitName: boolean;
  polarity: Polarity;
}

export interface BlockedType {
  readonly kind: "BlockedType";
  index: number;
  owner: Constraint | undefined;
}

export const enum PrimitiveKind {
  NilType,
  Boolean,
  Number,
  Integer,
  String,
  Thread,
  Function,
  Table,
  Buffer,
}

export interface PrimitiveType {
  readonly kind: "PrimitiveType";
  type: PrimitiveKind;
  metatable?: TypeId;
}

export interface BooleanSingleton {
  readonly kind: "BooleanSingleton";
  value: boolean;
}

export interface StringSingleton {
  readonly kind: "StringSingleton";
  /** The string's bytes, one character per byte. */
  value: string;
}

export type SingletonVariant = BooleanSingleton | StringSingleton;

export interface SingletonType {
  readonly kind: "SingletonType";
  variant: SingletonVariant;
}

export interface PendingExpansionType {
  readonly kind: "PendingExpansionType";
  prefix: string | undefined;
  name: string;
  typeArguments: TypeId[];
  packArguments: TypePackId[];
  index: number;
}

export interface FunctionArgument {
  name: string;
  location: Location;
}

export interface FunctionDefinition {
  definitionModuleName?: string;
  definitionLocation: Location;
  varargLocation?: Location;
  originalNameLocation: Location;
}

/**
 * A builtin function's special handling, as Luau's `MagicFunction`: `infer`
 * runs when the solver dispatches a call to it, `refine` when a call to it is
 * a condition, and `typeCheck` when the checker reaches a call to it.
 */
export interface MagicFunction {
  /** Returns whether it inferred the call's result. */
  infer(context: MagicFunctionCallContext): boolean;
  refine?(context: MagicRefinementContext): void;
  /** Returns whether it checked the call; otherwise the default checking runs. */
  typeCheck?(context: MagicFunctionTypeCheckContext): boolean;
}

export interface MagicFunctionCallContext {
  readonly solver: ConstraintSolver;
  readonly constraint: Constraint;
  readonly callSite: AstExprCall;
  readonly arguments: TypePackId;
  readonly result: TypePackId;
}

export interface MagicRefinementContext {
  readonly scope: Scope;
  readonly callSite: AstExprCall | undefined;
  readonly discriminantTypes: (TypeId | undefined)[];
}

export interface MagicFunctionTypeCheckContext {
  readonly typechecker: TypeChecker2;
  readonly builtinTypes: BuiltinTypes;
  readonly callSite: AstExprCall | undefined;
  readonly arguments: TypePackId;
  readonly checkScope: Scope;
}

export interface FunctionType {
  readonly kind: "FunctionType";
  definition?: FunctionDefinition;
  generics: TypeId[];
  genericPacks: TypePackId[];
  argNames: (FunctionArgument | undefined)[];
  tags: string[];
  level: TypeLevel;
  argTypes: TypePackId;
  retTypes: TypePackId;
  magic?: MagicFunction;
  hasSelf: boolean;
  hasNoFreeOrGenericTypes: boolean;
  isCheckedFunction: boolean;
  isDeprecatedFunction: boolean;
  /** What the function's `@deprecated` attribute says. */
  deprecatedInfo?: DeprecatedInfo;
}

export const enum TableState {
  Sealed,
  Unsealed,
  Free,
  Generic,
}

export class TableIndexer {
  constructor(
    public indexType: TypeId,
    public indexResultType: TypeId,
    public isReadOnly = false,
  ) {}
}

export class Property {
  deprecated = false;
  deprecatedSuggestion = "";
  /** Where the property was inferred from an expression. */
  location?: Location;
  /** Where the property was written in a type annotation. */
  typeLocation?: Location;
  tags: string[] = [];
  documentationSymbol?: string;
  readTy?: TypeId;
  writeTy?: TypeId;

  static readonly(ty: TypeId): Property {
    const p = new Property();
    p.readTy = ty;
    return p;
  }

  static writeonly(ty: TypeId): Property {
    const p = new Property();
    p.writeTy = ty;
    return p;
  }

  static rw(read: TypeId, write: TypeId = read): Property {
    const p = new Property();
    p.readTy = read;
    p.writeTy = write;
    return p;
  }

  static create(read: TypeId | undefined, write: TypeId | undefined): Property {
    if (read && !write) return Property.readonly(read);
    if (!read && write) return Property.writeonly(write);
    return Property.rw(read!, write!);
  }

  setType(ty: TypeId): void {
    this.readTy = ty;
    this.writeTy = ty;
  }

  makeShared(): void {
    if (this.writeTy) this.writeTy = this.readTy;
  }

  isShared(): boolean {
    return this.readTy !== undefined && this.writeTy !== undefined && this.readTy === this.writeTy;
  }

  isReadOnly(): boolean {
    return this.readTy !== undefined && this.writeTy === undefined;
  }

  isWriteOnly(): boolean {
    return this.readTy === undefined && this.writeTy !== undefined;
  }

  isReadWrite(): boolean {
    return this.readTy !== undefined && this.writeTy !== undefined;
  }

  clone(): Property {
    const p = new Property();
    p.deprecated = this.deprecated;
    p.deprecatedSuggestion = this.deprecatedSuggestion;
    p.location = this.location;
    p.typeLocation = this.typeLocation;
    p.tags = [...this.tags];
    p.documentationSymbol = this.documentationSymbol;
    p.readTy = this.readTy;
    p.writeTy = this.writeTy;
    return p;
  }
}

/** Compares two strings by their UTF-16 code units, as `std::string` compares its bytes. */
export function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A table's properties, iterated in name order as Luau's `std::map` iterates
 * them. Printed types list properties in this order.
 */
export class Props implements Iterable<[string, Property]> {
  private readonly map = new Map<string, Property>();
  private sorted: [string, Property][] | undefined;

  constructor(entries?: Iterable<[string, Property]>) {
    if (entries) for (const [k, v] of entries) this.map.set(k, v);
  }

  get size(): number {
    return this.map.size;
  }

  get(name: string): Property | undefined {
    return this.map.get(name);
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  set(name: string, prop: Property): void {
    if (!this.map.has(name)) this.sorted = undefined;
    this.map.set(name, prop);
  }

  delete(name: string): boolean {
    this.sorted = undefined;
    return this.map.delete(name);
  }

  clear(): void {
    this.sorted = undefined;
    this.map.clear();
  }

  entries(): [string, Property][] {
    if (!this.sorted) {
      this.sorted = [...this.map.entries()].sort((a, b) => compareNames(a[0], b[0]));
    }
    // Callers may insert while iterating, as C++ code over std::map may not;
    // a copy keeps iteration stable.
    return this.sorted.slice();
  }

  keys(): string[] {
    return this.entries().map(([k]) => k);
  }

  [Symbol.iterator](): Iterator<[string, Property]> {
    return this.entries()[Symbol.iterator]();
  }

  clone(): Props {
    const p = new Props();
    for (const [k, v] of this.map) p.map.set(k, v.clone());
    return p;
  }
}

export interface TableType {
  readonly kind: "TableType";
  props: Props;
  indexer?: TableIndexer;
  state: TableState;
  level: TypeLevel;
  scope: Scope | undefined;
  name?: string;
  /** A name used only when printing, with no entry in the type namespace. */
  syntheticName?: string;
  instantiatedTypeParams: TypeId[];
  instantiatedTypePackParams: TypePackId[];
  definitionModuleName: string;
  definitionLocation?: Location;
  boundTo?: TypeId;
  tags: string[];
  /** How many properties an unsealed table is still expected to gain. */
  remainingProps: number;
}

export interface MetatableType {
  readonly kind: "MetatableType";
  table: TypeId;
  metatable: TypeId;
  syntheticName?: string;
}

export interface ExternType {
  readonly kind: "ExternType";
  name: string;
  props: Props;
  parent?: TypeId;
  metatable?: TypeId;
  tags: string[];
  definitionModuleName: string;
  definitionLocation?: Location;
  indexer?: TableIndexer;
}

export const enum TypeFunctionInstanceState {
  Unsolved,
  Solved,
  Stuck,
}

/**
 * Luau's `UserDefinedFunctionData`: the declaration of a user-defined type
 * function and the environment its evaluation sees. Luau also records how many
 * scopes up each name is declared, which only its VM reads.
 */
export interface UserDefinedFunctionData {
  definition: AstStatTypeFunction;
  /** Each type function visible to the body, by name. */
  environmentFunction: Map<string, AstStatTypeFunction>;
  /** Each type alias the body names, by name. */
  environmentAlias: Map<string, TypeFun>;
}

export interface TypeFunctionInstanceType {
  readonly kind: "TypeFunctionInstanceType";
  function: TypeFunction;
  typeArguments: TypeId[];
  packArguments: TypePackId[];
  userFuncName?: string;
  userFuncData?: UserDefinedFunctionData;
  state: TypeFunctionInstanceState;
}

export interface AnyType {
  readonly kind: "AnyType";
}

export interface NoRefineType {
  readonly kind: "NoRefineType";
}

export interface UnionType {
  readonly kind: "UnionType";
  options: TypeId[];
}

export interface IntersectionType {
  readonly kind: "IntersectionType";
  parts: TypeId[];
}

export interface LazyType {
  readonly kind: "LazyType";
  unwrap: (self: LazyType) => void;
  unwrapped: TypeId | undefined;
}

export interface UnknownType {
  readonly kind: "UnknownType";
}

export interface NeverType {
  readonly kind: "NeverType";
}

export interface NegationType {
  readonly kind: "NegationType";
  ty: TypeId;
}

export type TypeVariant =
  | BoundType
  | ErrorType
  | FreeType
  | GenericType
  | PrimitiveType
  | SingletonType
  | BlockedType
  | PendingExpansionType
  | FunctionType
  | TableType
  | MetatableType
  | ExternType
  | AnyType
  | UnionType
  | IntersectionType
  | LazyType
  | UnknownType
  | NeverType
  | NegationType
  | NoRefineType
  | TypeFunctionInstanceType;

export type TypeKind = TypeVariant["kind"];
export type VariantOf<K extends TypeKind> = Extract<TypeVariant, { kind: K }>;

export class Type {
  /** Creation order, standing in for Luau's allocation address. */
  readonly serial = ++nextSerial;
  owningArena: TypeArena | undefined;
  documentationSymbol?: string;

  constructor(
    public ty: TypeVariant,
    public persistent = false,
  ) {}

  /** Re-assigns the cell's contents in place, as `Type::reassign`. */
  reassign(rhs: Type): void {
    this.ty = rhs.ty;
    this.documentationSymbol = rhs.documentationSymbol;
  }
}

export type TypeId = Type;

// ---------------------------------------------------------------------------
// Type pack variants
// ---------------------------------------------------------------------------

export interface BoundTypePack {
  readonly kind: "BoundTypePack";
  boundTo: TypePackId;
}

export interface ErrorTypePack {
  readonly kind: "ErrorTypePack";
  index: number;
  synthetic?: TypePackId;
}

export interface FreeTypePack {
  readonly kind: "FreeTypePack";
  index: number;
  level: TypeLevel;
  scope: Scope | undefined;
  polarity: Polarity;
}

export interface GenericTypePack {
  readonly kind: "GenericTypePack";
  index: number;
  level: TypeLevel;
  scope: Scope | undefined;
  name: string;
  explicitName: boolean;
  polarity: Polarity;
}

/** A rope of types: a head of known types, then an optional tail pack. */
export interface TypePack {
  readonly kind: "TypePack";
  head: TypeId[];
  tail?: TypePackId;
}

export interface VariadicTypePack {
  readonly kind: "VariadicTypePack";
  ty: TypeId;
  /** A hidden variadic is left out when the pack is printed. */
  hidden: boolean;
}

export interface BlockedTypePack {
  readonly kind: "BlockedTypePack";
  index: number;
  owner: Constraint | undefined;
}

export interface TypeFunctionInstanceTypePack {
  readonly kind: "TypeFunctionInstanceTypePack";
  function: TypePackFunction;
  typeArguments: TypeId[];
  packArguments: TypePackId[];
}

export type TypePackVariant =
  | BoundTypePack
  | ErrorTypePack
  | FreeTypePack
  | GenericTypePack
  | TypePack
  | VariadicTypePack
  | BlockedTypePack
  | TypeFunctionInstanceTypePack;

export type TypePackKind = TypePackVariant["kind"];
export type PackVariantOf<K extends TypePackKind> = Extract<TypePackVariant, { kind: K }>;

export class TypePackVar {
  readonly serial = ++nextSerial;
  owningArena: TypeArena | undefined;

  constructor(
    public ty: TypePackVariant,
    public persistent = false,
  ) {}

  reassign(rhs: TypePackVar): void {
    this.ty = rhs.ty;
  }
}

export type TypePackId = TypePackVar;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function boundType(boundTo: TypeId): BoundType {
  return { kind: "BoundType", boundTo };
}

export function errorType(synthetic?: TypeId): ErrorType {
  return { kind: "ErrorType", index: ++nextErrorIndex, synthetic };
}

export function freeType(scope: Scope | undefined, lowerBound: TypeId, upperBound: TypeId, polarity = Polarity.Unknown): FreeType {
  return {
    kind: "FreeType",
    index: freshIndex(),
    level: new TypeLevel(),
    scope,
    forwardedTypeAlias: false,
    lowerBound,
    upperBound,
    polarity,
  };
}

export function freeTypeAtLevel(level: TypeLevel, lowerBound: TypeId, upperBound: TypeId): FreeType {
  return { ...freeType(undefined, lowerBound, upperBound), level };
}

/**
 * A generic type. With a name it is an explicit generic; without one it takes
 * the synthetic name `g<index>` when it has no scope, as Luau's default
 * constructor does, and no name when it has a scope.
 */
export function genericType(options: { scope?: Scope; name?: string; polarity?: Polarity; level?: TypeLevel } = {}): GenericType {
  const index = freshIndex();
  const hasName = options.name !== undefined;
  return {
    kind: "GenericType",
    index,
    level: options.level ?? new TypeLevel(),
    scope: options.scope,
    name: hasName ? options.name! : options.scope ? "" : `g${index}`,
    explicitName: hasName,
    polarity: options.polarity ?? Polarity.Unknown,
  };
}

export function blockedType(): BlockedType {
  return { kind: "BlockedType", index: freshIndex(), owner: undefined };
}

export function primitiveType(type: PrimitiveKind, metatable?: TypeId): PrimitiveType {
  return { kind: "PrimitiveType", type, metatable };
}

export function booleanSingleton(value: boolean): SingletonType {
  return { kind: "SingletonType", variant: { kind: "BooleanSingleton", value } };
}

export function stringSingleton(value: string): SingletonType {
  return { kind: "SingletonType", variant: { kind: "StringSingleton", value } };
}

export function pendingExpansionType(
  prefix: string | undefined,
  name: string,
  typeArguments: TypeId[],
  packArguments: TypePackId[],
): PendingExpansionType {
  return { kind: "PendingExpansionType", prefix, name, typeArguments, packArguments, index: ++nextPendingExpansionIndex };
}

export function functionType(
  argTypes: TypePackId,
  retTypes: TypePackId,
  options: {
    generics?: TypeId[];
    genericPacks?: TypePackId[];
    definition?: FunctionDefinition;
    hasSelf?: boolean;
    level?: TypeLevel;
  } = {},
): FunctionType {
  return {
    kind: "FunctionType",
    definition: options.definition,
    generics: options.generics ?? [],
    genericPacks: options.genericPacks ?? [],
    argNames: [],
    tags: [],
    level: options.level ?? new TypeLevel(),
    argTypes,
    retTypes,
    hasSelf: options.hasSelf ?? false,
    hasNoFreeOrGenericTypes: false,
    isCheckedFunction: false,
    isDeprecatedFunction: false,
  };
}

export function tableType(
  options: {
    props?: Props;
    indexer?: TableIndexer;
    state?: TableState;
    level?: TypeLevel;
    scope?: Scope;
  } = {},
): TableType {
  return {
    kind: "TableType",
    props: options.props ?? new Props(),
    indexer: options.indexer,
    state: options.state ?? TableState.Unsealed,
    level: options.level ?? new TypeLevel(),
    scope: options.scope,
    instantiatedTypeParams: [],
    instantiatedTypePackParams: [],
    definitionModuleName: "",
    tags: [],
    remainingProps: 0,
  };
}

export function metatableType(table: TypeId, metatable: TypeId, syntheticName?: string): MetatableType {
  return { kind: "MetatableType", table, metatable, syntheticName };
}

export function externType(
  name: string,
  props: Props,
  options: { parent?: TypeId; metatable?: TypeId; definitionModuleName?: string; definitionLocation?: Location; indexer?: TableIndexer } = {},
): ExternType {
  return {
    kind: "ExternType",
    name,
    props,
    parent: options.parent,
    metatable: options.metatable,
    tags: [],
    definitionModuleName: options.definitionModuleName ?? "",
    definitionLocation: options.definitionLocation,
    indexer: options.indexer,
  };
}

export function typeFunctionInstanceType(
  fn: TypeFunction,
  typeArguments: TypeId[],
  packArguments: TypePackId[] = [],
  userFuncName?: string,
  userFuncData?: UserDefinedFunctionData,
): TypeFunctionInstanceType {
  return {
    kind: "TypeFunctionInstanceType",
    function: fn,
    typeArguments,
    packArguments,
    userFuncName,
    userFuncData,
    state: TypeFunctionInstanceState.Unsolved,
  };
}

export const ANY: AnyType = { kind: "AnyType" };
export const UNKNOWN: UnknownType = { kind: "UnknownType" };
export const NEVER: NeverType = { kind: "NeverType" };
export const NO_REFINE: NoRefineType = { kind: "NoRefineType" };

export function unionType(options: TypeId[]): UnionType {
  return { kind: "UnionType", options };
}

export function intersectionType(parts: TypeId[]): IntersectionType {
  return { kind: "IntersectionType", parts };
}

export function negationType(ty: TypeId): NegationType {
  return { kind: "NegationType", ty };
}

export function lazyType(unwrap: (self: LazyType) => void): LazyType {
  return { kind: "LazyType", unwrap, unwrapped: undefined };
}

export function boundTypePack(boundTo: TypePackId): BoundTypePack {
  return { kind: "BoundTypePack", boundTo };
}

export function errorTypePack(synthetic?: TypePackId): ErrorTypePack {
  return { kind: "ErrorTypePack", index: ++nextErrorIndex, synthetic };
}

export function freeTypePack(scope: Scope | undefined, polarity = Polarity.Unknown): FreeTypePack {
  return { kind: "FreeTypePack", index: freshIndex(), level: new TypeLevel(), scope, polarity };
}

export function genericTypePack(options: { scope?: Scope; name?: string; polarity?: Polarity } = {}): GenericTypePack {
  const index = freshIndex();
  const hasName = options.name !== undefined;
  return {
    kind: "GenericTypePack",
    index,
    level: new TypeLevel(),
    scope: options.scope,
    name: hasName ? options.name! : options.scope ? "" : `g${index}`,
    explicitName: hasName,
    polarity: options.polarity ?? Polarity.Unknown,
  };
}

export function typePack(head: TypeId[], tail?: TypePackId): TypePack {
  return { kind: "TypePack", head, tail };
}

export function variadicTypePack(ty: TypeId, hidden = false): VariadicTypePack {
  return { kind: "VariadicTypePack", ty, hidden };
}

export function blockedTypePack(): BlockedTypePack {
  return { kind: "BlockedTypePack", index: ++nextBlockedPackIndex, owner: undefined };
}

export function typeFunctionInstanceTypePack(
  fn: TypePackFunction,
  typeArguments: TypeId[],
  packArguments: TypePackId[] = [],
): TypeFunctionInstanceTypePack {
  return { kind: "TypeFunctionInstanceTypePack", function: fn, typeArguments, packArguments };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** The variant of a type when it is of the given kind, as Luau's `get<T>`. */
export function get<K extends TypeKind>(ty: TypeId | undefined, kind: K): VariantOf<K> | undefined {
  if (!ty) return undefined;
  const v = ty.ty;
  return v.kind === kind ? (v as VariantOf<K>) : undefined;
}

/** Whether a type is of any of the given kinds. */
export function is(ty: TypeId | undefined, ...kinds: TypeKind[]): boolean {
  if (!ty) return false;
  return kinds.includes(ty.ty.kind);
}

export function getPack<K extends TypePackKind>(tp: TypePackId | undefined, kind: K): PackVariantOf<K> | undefined {
  if (!tp) return undefined;
  const v = tp.ty;
  return v.kind === kind ? (v as PackVariantOf<K>) : undefined;
}

export function isPack(tp: TypePackId | undefined, ...kinds: TypePackKind[]): boolean {
  if (!tp) return false;
  return kinds.includes(tp.ty.kind);
}

export function getSingleton<K extends SingletonVariant["kind"]>(
  ty: TypeId | undefined,
  kind: K,
): Extract<SingletonVariant, { kind: K }> | undefined {
  const st = get(ty, "SingletonType");
  if (!st) return undefined;
  return st.variant.kind === kind ? (st.variant as Extract<SingletonVariant, { kind: K }>) : undefined;
}

/** Replaces a type's contents in place, as Luau's `emplaceType`. */
export function emplaceType(ty: TypeId, variant: TypeVariant): TypeVariant {
  if (variant.kind === "BoundType" && follow(variant.boundTo) === ty) {
    throw new InternalCompilerError("emplaceType would bind a type to itself");
  }
  ty.ty = variant;
  return variant;
}

export function emplaceTypePack(tp: TypePackId, variant: TypePackVariant): TypePackVariant {
  if (variant.kind === "BoundTypePack" && followPack(variant.boundTo) === tp) {
    throw new InternalCompilerError("emplaceTypePack would bind a pack to itself");
  }
  tp.ty = variant;
  return variant;
}

export class InternalCompilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalCompilerError";
  }
}

function unwrapLazy(ltv: LazyType): TypeId {
  if (ltv.unwrapped) return ltv.unwrapped;
  ltv.unwrap(ltv);
  const unwrapped = ltv.unwrapped as TypeId | undefined;
  if (!unwrapped) throw new InternalCompilerError("Lazy Type didn't fill in unwrapped type field");
  if (get(unwrapped, "LazyType")) throw new InternalCompilerError("Lazy Type cannot resolve to another Lazy Type");
  return unwrapped;
}

function advanceType(ty: TypeId, followLazy: boolean): TypeId | undefined {
  const v = ty.ty;
  if (v.kind === "BoundType") return v.boundTo;
  if (v.kind === "TableType") return v.boundTo;
  if (v.kind === "LazyType" && followLazy) return unwrapLazy(v);
  return undefined;
}

/** Follows bound types (and a table's `boundTo`, and lazy types) to the type they stand for. */
export function follow(t: TypeId, followLazy = true): TypeId {
  let cycleTester: TypeId | undefined = t;
  const a = advanceType(cycleTester, followLazy);
  if (!a) return t;
  cycleTester = a;
  if (!advanceType(cycleTester, followLazy)) return cycleTester;
  for (;;) {
    const a1 = advanceType(t, followLazy);
    if (!a1) return t;
    t = a1;
    if (cycleTester) {
      const a2 = advanceType(cycleTester, followLazy);
      if (a2) {
        cycleTester = advanceType(a2, followLazy);
      } else {
        cycleTester = undefined;
      }
      if (t === cycleTester) throw new InternalCompilerError("Luau::follow detected a Type cycle!!");
    }
  }
}

function advancePack(tp: TypePackId): TypePackId | undefined {
  const v = tp.ty;
  if (v.kind === "BoundTypePack") return v.boundTo;
  if (v.kind === "TypePack" && v.head.length === 0) return v.tail;
  return undefined;
}

/** Follows bound packs, and packs with an empty head, to the pack they stand for. */
export function followPack(tp: TypePackId): TypePackId {
  let cycleTester: TypePackId | undefined = tp;
  const a = advancePack(cycleTester);
  if (!a) return tp;
  cycleTester = a;
  if (!advancePack(cycleTester)) return cycleTester;
  for (;;) {
    const a1 = advancePack(tp);
    if (!a1) return tp;
    tp = a1;
    if (cycleTester) {
      const a2 = advancePack(cycleTester);
      cycleTester = a2 ? advancePack(a2) : undefined;
      if (tp === cycleTester) throw new InternalCompilerError("Luau::follow detected a Type cycle!!");
    }
  }
}

// ---------------------------------------------------------------------------
// Arenas and the builtin types
// ---------------------------------------------------------------------------

export class TypeArena {
  readonly types: Type[] = [];
  readonly typePacks: TypePackVar[] = [];

  addType(variant: TypeVariant): TypeId {
    const ty = new Type(variant);
    ty.owningArena = this;
    this.types.push(ty);
    return ty;
  }

  addTypePack(variantOrHead: TypePackVariant | TypeId[], tail?: TypePackId): TypePackId {
    const variant = Array.isArray(variantOrHead) ? typePack(variantOrHead, tail) : variantOrHead;
    const tp = new TypePackVar(variant);
    tp.owningArena = this;
    this.typePacks.push(tp);
    return tp;
  }

  freshType(builtins: BuiltinTypes, scope: Scope | undefined, polarity = Polarity.Unknown): TypeId {
    return this.addType(freeType(scope, builtins.neverType, builtins.unknownType, polarity));
  }

  freshTypePack(scope: Scope | undefined, polarity = Polarity.Unknown): TypePackId {
    return this.addTypePack(freeTypePack(scope, polarity));
  }

  addTypeFunction(fn: TypeFunction, typeArguments: TypeId[], packArguments: TypePackId[] = []): TypeId {
    return this.addType(typeFunctionInstanceType(fn, typeArguments, packArguments));
  }

  addTypePackFunction(fn: TypePackFunction, typeArguments: TypeId[], packArguments: TypePackId[] = []): TypePackId {
    return this.addTypePack(typeFunctionInstanceTypePack(fn, typeArguments, packArguments));
  }
}

/** A free type bounded by `never` and `unknown` (Luau's free `freshType` function). */
export function freshType(arena: TypeArena, builtinTypes: BuiltinTypes, scope: Scope | undefined, polarity = Polarity.Unknown): TypeId {
  return arena.addType(freeType(scope, builtinTypes.neverType, builtinTypes.unknownType, polarity));
}

export interface GenericTypeDefinition {
  ty: TypeId;
  defaultValue?: TypeId;
}

export interface GenericTypePackDefinition {
  tp: TypePackId;
  defaultValue?: TypePackId;
}

/** A type alias: its type parameters, and the type they are substituted into. */
export class TypeFun {
  constructor(
    public type: TypeId,
    public typeParams: GenericTypeDefinition[] = [],
    public typePackParams: GenericTypePackDefinition[] = [],
    public definitionLocation?: Location,
  ) {}
}

// `BuiltinTypeFunctions.ts` registers how to create the builtin type
// functions as it loads. It depends on most of the checker, so importing it
// here would put this module in an import cycle with all of those.
let makeBuiltinTypeFunctions: (() => BuiltinTypeFunctions) | undefined;

export function registerBuiltinTypeFunctions(make: () => BuiltinTypeFunctions): void {
  makeBuiltinTypeFunctions = make;
}

/** Luau's `BuiltinTypes`: the persistent types every module shares. */
export class BuiltinTypes {
  readonly arena = new TypeArena();
  readonly nilType: TypeId;
  readonly numberType: TypeId;
  readonly integerType: TypeId;
  readonly stringType: TypeId;
  readonly booleanType: TypeId;
  readonly threadType: TypeId;
  readonly bufferType: TypeId;
  readonly functionType: TypeId;
  readonly externType: TypeId;
  readonly objectType: TypeId;
  readonly classType: TypeId;
  readonly tableType: TypeId;
  readonly emptyTableType: TypeId;
  readonly trueType: TypeId;
  readonly falseType: TypeId;
  readonly anyType: TypeId;
  readonly unknownType: TypeId;
  readonly neverType: TypeId;
  readonly errorType: TypeId;
  readonly noRefineType: TypeId;
  readonly falsyType: TypeId;
  readonly truthyType: TypeId;
  readonly notNilType: TypeId;
  readonly optionalNumberType: TypeId;
  readonly optionalStringType: TypeId;
  readonly emptyTypePack: TypePackId;
  readonly anyTypePack: TypePackId;
  readonly unknownTypePack: TypePackId;
  readonly neverTypePack: TypePackId;
  readonly uninhabitableTypePack: TypePackId;
  readonly errorTypePack: TypePackId;

  constructor() {
    const add = (v: TypeVariant) => {
      const t = this.arena.addType(v);
      t.persistent = true;
      return t;
    };
    const addPack = (v: TypePackVariant) => {
      const t = this.arena.addTypePack(v);
      t.persistent = true;
      return t;
    };
    this.nilType = add(primitiveType(PrimitiveKind.NilType));
    this.numberType = add(primitiveType(PrimitiveKind.Number));
    this.integerType = add(primitiveType(PrimitiveKind.Integer));
    this.stringType = add(primitiveType(PrimitiveKind.String));
    this.booleanType = add(primitiveType(PrimitiveKind.Boolean));
    this.threadType = add(primitiveType(PrimitiveKind.Thread));
    this.bufferType = add(primitiveType(PrimitiveKind.Buffer));
    this.functionType = add(primitiveType(PrimitiveKind.Function));
    this.externType = add(externType("userdata", new Props()));
    this.objectType = add(externType("object", new Props()));
    this.classType = add(externType("class", new Props()));
    this.tableType = add(primitiveType(PrimitiveKind.Table));
    this.emptyTableType = add(tableType({ state: TableState.Sealed }));
    this.trueType = add(booleanSingleton(true));
    this.falseType = add(booleanSingleton(false));
    this.anyType = add(ANY);
    this.unknownType = add(UNKNOWN);
    this.neverType = add(NEVER);
    this.errorType = add(errorType());
    this.noRefineType = add(NO_REFINE);
    this.falsyType = add(unionType([this.falseType, this.nilType]));
    this.truthyType = add(negationType(this.falsyType));
    this.notNilType = add(negationType(this.nilType));
    this.optionalNumberType = add(unionType([this.numberType, this.nilType]));
    this.optionalStringType = add(unionType([this.stringType, this.nilType]));
    this.emptyTypePack = addPack(typePack([]));
    this.anyTypePack = addPack(variadicTypePack(this.anyType));
    this.unknownTypePack = addPack(variadicTypePack(this.unknownType));
    this.neverTypePack = addPack(variadicTypePack(this.neverType));
    this.uninhabitableTypePack = addPack(typePack([this.neverType], this.neverTypePack));
    this.errorTypePack = addPack(errorTypePack());
  }

  private _typeFunctions: BuiltinTypeFunctions | undefined;

  /** The builtin type functions, such as `add` and `index`, created on first use. */
  get typeFunctions(): BuiltinTypeFunctions {
    if (!this._typeFunctions) {
      if (!makeBuiltinTypeFunctions) throw new InternalCompilerError("the builtin type functions are not loaded");
      this._typeFunctions = makeBuiltinTypeFunctions();
    }
    return this._typeFunctions;
  }

  errorRecoveryType(guess?: TypeId): TypeId {
    return guess ?? this.errorType;
  }

  errorRecoveryTypePack(guess?: TypePackId): TypePackId {
    return guess ?? this.errorTypePack;
  }
}

// ---------------------------------------------------------------------------
// Predicates and helpers from Type.cpp
// ---------------------------------------------------------------------------

/** The members of a union or intersection, with nested ones flattened, as Luau's `TypeIterator`. */
export function flatOptions(ty: UnionType | IntersectionType): TypeId[] {
  const kind = ty.kind;
  const result: TypeId[] = [];
  const seen = new Set<UnionType | IntersectionType>([ty]);
  const walk = (types: TypeId[]) => {
    for (const t of types) {
      const f = follow(t);
      const inner = f.ty.kind === kind ? (f.ty as UnionType | IntersectionType) : undefined;
      if (inner) {
        if (seen.has(inner)) continue;
        seen.add(inner);
        walk(inner.kind === "UnionType" ? inner.options : inner.parts);
      } else {
        result.push(f);
      }
    }
  };
  walk(ty.kind === "UnionType" ? ty.options : ty.parts);
  return result;
}

export function flattenIntersection(ty: TypeId): TypeId[] {
  if (!get(follow(ty), "IntersectionType")) return [ty];
  const seen = new Set<TypeId>();
  const queue: TypeId[] = [ty];
  const result: TypeId[] = [];
  while (queue.length) {
    const current = follow(queue.shift()!);
    if (seen.has(current)) continue;
    seen.add(current);
    const itv = get(current, "IntersectionType");
    if (itv) queue.push(...itv.parts);
    else result.push(current);
  }
  return result;
}

export function isPrim(ty: TypeId, primType: PrimitiveKind): boolean {
  const p = get(follow(ty), "PrimitiveType");
  return p !== undefined && p.type === primType;
}

export function isNil(ty: TypeId): boolean {
  return isPrim(ty, PrimitiveKind.NilType);
}

export function isBoolean(ty: TypeId): boolean {
  if (isPrim(ty, PrimitiveKind.Boolean) || getSingleton(follow(ty), "BooleanSingleton")) return true;
  const utv = get(follow(ty), "UnionType");
  if (utv) return flatOptions(utv).every(isBoolean);
  return false;
}

export function isNumber(ty: TypeId): boolean {
  return isPrim(ty, PrimitiveKind.Number);
}

/** Whether a type is a subtype of string. */
export function isString(ty: TypeId): boolean {
  ty = follow(ty);
  if (isPrim(ty, PrimitiveKind.String) || getSingleton(ty, "StringSingleton")) return true;
  const utv = get(ty, "UnionType");
  if (utv) return flatOptions(utv).every(isString);
  return false;
}

/** Whether string is a subtype of a type. */
export function maybeString(ty: TypeId): boolean {
  ty = follow(ty);
  if (isPrim(ty, PrimitiveKind.String) || get(ty, "AnyType")) return true;
  const utv = get(ty, "UnionType");
  if (utv) return flatOptions(utv).some(maybeString);
  return false;
}

export function isThread(ty: TypeId): boolean {
  return isPrim(ty, PrimitiveKind.Thread);
}

export function isBuffer(ty: TypeId): boolean {
  return isPrim(ty, PrimitiveKind.Buffer);
}

export function isOptional(ty: TypeId): boolean {
  if (isNil(ty)) return true;
  ty = follow(ty);
  if (get(ty, "AnyType") || get(ty, "UnknownType")) return true;
  const utv = get(ty, "UnionType");
  if (!utv) return false;
  return flatOptions(utv).some(isOptional);
}

export function getTableType(type: TypeId): TableType | undefined {
  type = follow(type);
  const ttv = get(type, "TableType");
  if (ttv) return ttv;
  const mtv = get(type, "MetatableType");
  if (mtv) return get(follow(mtv.table), "TableType");
  return undefined;
}

export function isTableIntersection(ty: TypeId): boolean {
  if (!get(follow(ty), "IntersectionType")) return false;
  return flattenIntersection(ty).every((t) => getTableType(t) !== undefined);
}

export function isTableUnion(ty: TypeId): boolean {
  const ut = get(follow(ty), "UnionType");
  if (!ut) return false;
  return flatOptions(ut).every((t) => getTableType(t) !== undefined);
}

export function isOverloadedFunction(ty: TypeId): boolean {
  if (!get(follow(ty), "IntersectionType")) return false;
  return flattenIntersection(ty).every((part) => get(part, "FunctionType") !== undefined);
}

export function getMetatable(type: TypeId, builtinTypes: BuiltinTypes): TypeId | undefined {
  type = follow(type);
  const mt = get(type, "MetatableType");
  if (mt) return mt.metatable;
  const et = get(type, "ExternType");
  if (et) return et.metatable;
  if (isString(type)) return get(builtinTypes.stringType, "PrimitiveType")!.metatable;
  return undefined;
}

export function getName(type: TypeId): string | undefined {
  type = follow(type);
  const mtv = get(type, "MetatableType");
  if (mtv) {
    if (mtv.syntheticName !== undefined) return mtv.syntheticName;
    type = follow(mtv.table);
  }
  const ttv = get(type, "TableType");
  if (ttv) {
    if (ttv.name !== undefined) return ttv.name;
    if (ttv.syntheticName !== undefined) return ttv.syntheticName;
  }
  return undefined;
}

export function maybeSingleton(ty: TypeId): boolean {
  ty = follow(ty);
  if (get(ty, "SingletonType")) return true;
  const utv = get(ty, "UnionType");
  if (utv) {
    for (const option of flatOptions(utv)) if (get(follow(option), "SingletonType")) return true;
  }
  const itv = get(ty, "IntersectionType");
  if (itv) {
    for (const part of flatOptions(itv)) if (maybeSingleton(part)) return true;
  }
  const tfit = get(ty, "TypeFunctionInstanceType");
  if (tfit && (tfit.function.name === "keyof" || tfit.function.name === "rawkeyof")) return true;
  return false;
}

export function hasLength(ty: TypeId, seen = new Set<TypeId>()): boolean {
  ty = follow(ty);
  if (seen.has(ty)) return true;
  if (isString(ty) || isPrim(ty, PrimitiveKind.Table) || get(ty, "AnyType") || get(ty, "TableType") || get(ty, "MetatableType")) {
    return true;
  }
  const uty = get(ty, "UnionType");
  if (uty) {
    seen.add(ty);
    return uty.options.every((part) => hasLength(part, seen));
  }
  const ity = get(ty, "IntersectionType");
  if (ity) {
    seen.add(ty);
    return ity.parts.some((part) => hasLength(part, seen));
  }
  return false;
}

export function lookupExternTypeProp(cls: ExternType | undefined, name: string): Property | undefined {
  while (cls) {
    const p = cls.props.get(name);
    if (p) return p;
    if (!cls.parent) return undefined;
    cls = get(cls.parent, "ExternType");
  }
  return undefined;
}

export function isSubclass(cls: ExternType | undefined, parent: ExternType): boolean {
  while (cls) {
    if (cls === parent) return true;
    if (!cls.parent) return false;
    cls = get(cls.parent, "ExternType");
  }
  return false;
}

/** The types a predicate maps each member of a union (or the type itself) to, as Luau's `filterMap`. */
export function filterMap(type: TypeId, predicate: (ty: TypeId) => TypeId | undefined): TypeId[] {
  type = follow(type);
  const utv = get(type, "UnionType");
  if (utv) {
    const options = new Set<TypeId>();
    for (const option of flatOptions(utv)) {
      const out = predicate(follow(option));
      if (out) options.add(out);
    }
    return [...options].sort((a, b) => a.serial - b.serial);
  }
  const out = predicate(type);
  return out ? [out] : [];
}

function getTags(ty: TypeId): string[] | undefined {
  ty = follow(ty);
  return get(ty, "FunctionType")?.tags ?? get(ty, "TableType")?.tags ?? get(ty, "ExternType")?.tags;
}

export function attachTag(ty: TypeId, tagName: string): void {
  getTags(ty)?.push(tagName);
}

export function hasTag(ty: TypeId, tagName: string): boolean {
  ty = follow(ty);
  let etv = get(ty, "ExternType");
  if (etv) {
    while (etv) {
      if (etv.tags.includes(tagName)) return true;
      if (!etv.parent) return false;
      etv = get(etv.parent, "ExternType");
    }
    return false;
  }
  return getTags(ty)?.includes(tagName) ?? false;
}

export function hasTypeInIntersection(ty: TypeId, kind: TypeKind): boolean {
  const tf = follow(ty);
  if (tf.ty.kind === kind) return true;
  return flattenIntersection(tf).some((t) => follow(t).ty.kind === kind);
}

export function hasPrimitiveTypeInIntersection(ty: TypeId, primTy: PrimitiveKind): boolean {
  const tf = follow(ty);
  if (isPrim(tf, primTy)) return true;
  // Luau returns after the first part.
  const first = flattenIntersection(tf)[0];
  return first !== undefined && isPrim(follow(first), primTy);
}

export function persist(ty: TypeId): void {
  const queue: TypeId[] = [ty];
  while (queue.length) {
    const t = queue.shift()!;
    if (t.persistent) continue;
    t.persistent = true;
    const v = t.ty;
    switch (v.kind) {
      case "BoundType":
        queue.push(v.boundTo);
        break;
      case "FunctionType":
        persistPack(v.argTypes);
        persistPack(v.retTypes);
        break;
      case "TableType":
        for (const [, prop] of v.props) {
          if (prop.readTy) queue.push(prop.readTy);
          if (prop.writeTy) queue.push(prop.writeTy);
        }
        if (v.indexer) queue.push(v.indexer.indexType, v.indexer.indexResultType);
        break;
      case "ExternType":
        for (const [, prop] of v.props) {
          if (prop.readTy) queue.push(prop.readTy);
          if (prop.writeTy) queue.push(prop.writeTy);
        }
        break;
      case "UnionType":
        queue.push(...v.options);
        break;
      case "IntersectionType":
        queue.push(...v.parts);
        break;
      case "MetatableType":
        queue.push(v.table, v.metatable);
        break;
      case "TypeFunctionInstanceType":
        queue.push(...v.typeArguments);
        for (const tp of v.packArguments) persistPack(tp);
        break;
      default:
        break;
    }
  }
}

export function persistPack(tp: TypePackId): void {
  if (tp.persistent) return;
  tp.persistent = true;
  const v = tp.ty;
  if (v.kind === "TypePack") {
    for (const ty of v.head) persist(ty);
    if (v.tail) persistPack(v.tail);
  } else if (v.kind === "VariadicTypePack") {
    persist(v.ty);
  } else if (v.kind === "TypeFunctionInstanceTypePack") {
    for (const ty of v.typeArguments) persist(ty);
    for (const p of v.packArguments) persistPack(p);
  }
}

// ---------------------------------------------------------------------------
// Type packs (TypePack.cpp)
// ---------------------------------------------------------------------------

/**
 * Walks the types at the head of a pack, through nested packs, as Luau's
 * `TypePackIterator`: `types` are the head types in order and `tail` the pack
 * the walk stopped at, when it is not a plain pack.
 */
export function flatten(tp: TypePackId): { head: TypeId[]; tail: TypePackId | undefined } {
  const head: TypeId[] = [];
  let current: TypePackId | undefined = followPack(tp);
  const seen = new Set<TypePackId>();
  for (;;) {
    if (!current) return { head, tail: undefined };
    const p: TypePack | undefined = getPack(current, "TypePack");
    if (!p) return { head, tail: current };
    if (seen.has(current)) throw new InternalCompilerError("TypePackIterator detected a type pack cycle");
    seen.add(current);
    head.push(...p.head);
    current = p.tail ? followPack(p.tail) : undefined;
  }
}

/** The first pack a walk of the head reaches that is not a plain pack, or undefined for a finite pack. */
export function packTail(tp: TypePackId): TypePackId | undefined {
  return flatten(tp).tail;
}

export function getTail(tp: TypePackId): TypePackId {
  const seen = new Set<TypePackId>();
  for (;;) {
    tp = followPack(tp);
    if (seen.has(tp)) break;
    seen.add(tp);
    const pack = getPack(tp, "TypePack");
    if (pack && pack.tail) tp = pack.tail;
    else break;
  }
  return followPack(tp);
}

export function packSize(tp: TypePackId): number {
  tp = followPack(tp);
  const pack = getPack(tp, "TypePack");
  if (!pack) return 0;
  let result = pack.head.length;
  if (pack.tail) {
    const tail = getPack(followPack(pack.tail), "TypePack");
    if (tail) result += packSize(followPack(pack.tail));
  }
  return result;
}

export function finite(tp: TypePackId): boolean {
  tp = followPack(tp);
  const pack = getPack(tp, "TypePack");
  if (pack) return pack.tail ? finite(pack.tail) : true;
  if (getPack(tp, "VariadicTypePack")) return false;
  return true;
}

export function first(tp: TypePackId, ignoreHiddenVariadics = true): TypeId | undefined {
  const { head, tail } = flatten(tp);
  if (head.length) return head[0];
  if (tail) {
    const vtp = getPack(tail, "VariadicTypePack");
    if (vtp && (!vtp.hidden || !ignoreHiddenVariadics)) return vtp.ty;
  }
  return undefined;
}

export function isEmpty(tp: TypePackId): boolean {
  tp = followPack(tp);
  const tpp = getPack(tp, "TypePack");
  if (tpp) return tpp.head.length === 0 && (!tpp.tail || isEmpty(tpp.tail));
  return false;
}

export function isVariadicTail(tp: TypePackId, includeHiddenVariadics = false): boolean {
  if (getPack(tp, "GenericTypePack")) return true;
  const vtp = getPack(tp, "VariadicTypePack");
  return vtp !== undefined && (includeHiddenVariadics || !vtp.hidden);
}

/** Whether a pack arose from a function declared variadic. */
export function isVariadic(tp: TypePackId): boolean {
  const tail = flatten(tp).tail;
  if (!tail) return false;
  return isVariadicTail(tail);
}

export function containsNever(tp: TypePackId): boolean {
  const { head, tail } = flatten(tp);
  if (head.some((t) => get(follow(t), "NeverType"))) return true;
  if (tail) {
    const vtp = getPack(tail, "VariadicTypePack");
    if (vtp && get(follow(vtp.ty), "NeverType")) return true;
  }
  return false;
}

/** The pack from `sliceIndex` on, given the pack already split into head and tail. */
export function sliceTypePack(
  sliceIndex: number,
  toBeSliced: TypePackId,
  head: TypeId[],
  tail: TypePackId | undefined,
  builtinTypes: BuiltinTypes,
  arena: TypeArena,
): TypePackId {
  if (sliceIndex === 0) return toBeSliced;
  if (sliceIndex === head.length) return tail ?? builtinTypes.emptyTypePack;
  return arena.addTypePack(head.slice(sliceIndex), tail);
}
