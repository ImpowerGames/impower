// Printing types exactly as Luau's `toString` prints them, ported from
// `Analysis/src/ToString.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).
// The ported type-checker tests compare types as text, so every choice here
// (sorting union members as strings, naming cycles `t1`, writing `nil` as
// `?`) follows Luau's output.

import type { Scope } from "./Scope";
import {
  finite,
  flatOptions,
  flatten,
  follow,
  followPack,
  get,
  getPack,
  isEmpty,
  isNil,
  isNumber,
  isOverloadedFunction,
  packSize,
  PrimitiveKind,
  TableState,
  type FunctionArgument,
  type FunctionType,
  type Property,
  type TableType,
  type TypeId,
  type TypePackId,
  type TypePackVariant,
  type TypeVariant,
  type UnionType,
} from "./Type";
import { TypeVisitor } from "./VisitType";

export interface ToStringNameMap {
  types: Map<TypeId, string>;
  typePacks: Map<TypePackId, string>;
}

export interface ToStringOptions {
  /** Produce complete output rather than comprehensible output. */
  exhaustive?: boolean;
  /** Put long results, such as table entries, on lines of their own. */
  useLineBreaks?: boolean;
  /** Print function argument names where they are known. */
  functionTypeArguments?: boolean;
  /** Print every table with plain braces. */
  hideTableKind?: boolean;
  /** Leave out the type parameters of a named function at the top level. */
  hideNamedFunctionTypeParameters?: boolean;
  /** Leave out `self: X` from a method's signature. */
  hideFunctionSelfArgument?: boolean;
  /** Print table aliases by name even in exhaustive output. */
  hideTableAliasExpansions?: boolean;
  /** Write optional types with a postfix `?` rather than as unions with nil. Defaults to true. */
  useQuestionMarks?: boolean;
  /** Ignore synthetic names on table types. */
  ignoreSyntheticName?: boolean;
  maxTableLength?: number;
  maxTypeLength?: number;
  compositeTypesSingleLineLimit?: number;
  nameMap?: ToStringNameMap;
  /** When present, qualifies names with their module and marks types not visible in the scope as invalid. */
  scope?: Scope;
  namedFunctionOverrideArgNames?: string[];
}

interface ResolvedOptions {
  exhaustive: boolean;
  useLineBreaks: boolean;
  functionTypeArguments: boolean;
  hideTableKind: boolean;
  hideNamedFunctionTypeParameters: boolean;
  hideFunctionSelfArgument: boolean;
  hideTableAliasExpansions: boolean;
  useQuestionMarks: boolean;
  ignoreSyntheticName: boolean;
  maxTableLength: number;
  maxTypeLength: number;
  compositeTypesSingleLineLimit: number;
  nameMap: ToStringNameMap;
  scope: Scope | undefined;
  namedFunctionOverrideArgNames: string[];
}

// Luau's defaults for `LuauTypeMaximumStringifierLength` and
// `LuauTableTypeMaximumStringifierLength`.
const DEFAULT_MAX_TYPE_LENGTH = 500;
const DEFAULT_MAX_TABLE_LENGTH = 0;

function resolveOptions(opts: ToStringOptions): ResolvedOptions {
  return {
    exhaustive: opts.exhaustive ?? false,
    useLineBreaks: opts.useLineBreaks ?? false,
    functionTypeArguments: opts.functionTypeArguments ?? false,
    hideTableKind: opts.hideTableKind ?? false,
    hideNamedFunctionTypeParameters: opts.hideNamedFunctionTypeParameters ?? false,
    hideFunctionSelfArgument: opts.hideFunctionSelfArgument ?? false,
    hideTableAliasExpansions: opts.hideTableAliasExpansions ?? false,
    useQuestionMarks: opts.useQuestionMarks ?? true,
    ignoreSyntheticName: opts.ignoreSyntheticName ?? false,
    maxTableLength: opts.maxTableLength ?? DEFAULT_MAX_TABLE_LENGTH,
    maxTypeLength: opts.maxTypeLength ?? DEFAULT_MAX_TYPE_LENGTH,
    compositeTypesSingleLineLimit: opts.compositeTypesSingleLineLimit ?? 5,
    nameMap: opts.nameMap ?? { types: new Map(), typePacks: new Map() },
    scope: opts.scope,
    namedFunctionOverrideArgNames: opts.namedFunctionOverrideArgNames ?? [],
  };
}

export interface ToStringResult {
  name: string;
  invalid: boolean;
  error: boolean;
  cycle: boolean;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

/** Luau's `isIdentifier`: every character is a letter, digit or underscore. */
export function isIdentifier(s: string): boolean {
  return /^[A-Za-z0-9_]*$/.test(s);
}

/**
 * Luau's `escape`, over a string whose characters are bytes: control
 * characters, quotes, backslashes, backticks and braces are escaped, the
 * common ones by letter and the rest as three decimal digits.
 */
export function escape(s: string, escapeForInterpString = false): string {
  let r = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) & 0xff;
    const ch = String.fromCharCode(c);
    if (c >= 0x20 && ch !== "\\" && ch !== "'" && ch !== '"' && ch !== "`" && ch !== "{") {
      r += ch;
      continue;
    }
    r += "\\";
    if (escapeForInterpString && (ch === "`" || ch === "{")) {
      r += ch;
      continue;
    }
    switch (c) {
      case 0x07:
        r += "a";
        break;
      case 0x08:
        r += "b";
        break;
      case 0x0c:
        r += "f";
        break;
      case 0x0a:
        r += "n";
        break;
      case 0x0d:
        r += "r";
        break;
      case 0x09:
        r += "t";
        break;
      case 0x0b:
        r += "v";
        break;
      case 0x27:
        r += "'";
        break;
      case 0x22:
        r += '"';
        break;
      case 0x5c:
        r += "\\";
        break;
      default:
        r += String(c).padStart(3, "0");
    }
  }
  return r;
}

const GENERIC_TYPE_LETTERS = "TUVWXYZABCDEFGHIJKLMNOPQRS";

export function generateName(i: number, isForGeneric: boolean): string {
  let n = isForGeneric ? GENERIC_TYPE_LETTERS[i % 26]! : String.fromCharCode(97 + (i % 26));
  if (i >= 26) n += String(Math.floor(i / 26));
  return n;
}

export function toHumanReadableIndex(number: number): string {
  const humanIndex = number + 1;
  const finalDigit = humanIndex % 10;
  if (humanIndex > 10 && humanIndex < 20) return `${humanIndex}th`;
  switch (finalDigit) {
    case 1:
      return `${humanIndex}st`;
    case 2:
      return `${humanIndex}nd`;
    case 3:
      return `${humanIndex}rd`;
    default:
      return `${humanIndex}th`;
  }
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

class FindCyclicTypes extends TypeVisitor {
  readonly visited = new Set<TypeId>();
  readonly visitedPacks = new Set<TypePackId>();
  readonly cycles = new Set<TypeId>();
  readonly cycleTPs = new Set<TypePackId>();

  constructor(readonly exhaustive: boolean) {
    super("FindCyclicTypes", true);
  }

  override cycle(ty: TypeId): void {
    this.cycles.add(ty);
  }

  override cyclePack(tp: TypePackId): void {
    this.cycleTPs.add(tp);
  }

  override visit(ty: TypeId): boolean {
    if (this.visited.has(ty)) return false;
    this.visited.add(ty);
    return true;
  }

  override visitPack(tp: TypePackId): boolean {
    if (this.visitedPacks.has(tp)) return false;
    this.visitedPacks.add(tp);
    return true;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "FreeType":
        if (this.visited.has(ty)) return false;
        this.visited.add(ty);
        this.traverse(v.lowerBound);
        this.traverse(v.upperBound);
        return false;
      case "TableType":
        if (this.visited.has(ty)) return false;
        this.visited.add(ty);
        if (v.name !== undefined || v.syntheticName !== undefined) {
          for (const itp of v.instantiatedTypeParams) this.traverse(itp);
          for (const itp of v.instantiatedTypePackParams) this.traversePack(itp);
          return this.exhaustive;
        }
        return true;
      case "ExternType":
      case "PendingExpansionType":
        return false;
      default:
        return this.visit(ty);
    }
  }
}

function bySerial<T extends { serial: number }>(a: T, b: T): number {
  return a.serial - b.serial;
}

// ---------------------------------------------------------------------------
// The stringifier
// ---------------------------------------------------------------------------

function canUseTypeNameInScope(scope: Scope | undefined, name: string): { success: boolean; moduleName?: string } {
  for (let curr = scope; curr; curr = curr.parent) {
    for (const [importName, nameTable] of curr.importedTypeBindings) {
      if (nameTable.has(name)) return { success: true, moduleName: importName };
    }
    if (curr.exportedTypeBindings.has(name)) return { success: true };
  }
  return { success: false };
}

class StringifierState {
  readonly cycleNames = new Map<TypeId, string>();
  readonly cycleTpNames = new Map<TypePackId, string>();
  readonly seen = new Set<object>();
  readonly usedNames = new Set<string>();
  indentation = 0;
  exhaustive: boolean;
  ignoreSyntheticName: boolean;
  previousNameIndex = 0;

  constructor(
    readonly opts: ResolvedOptions,
    readonly result: ToStringResult,
  ) {
    this.exhaustive = opts.exhaustive;
    this.ignoreSyntheticName = opts.ignoreSyntheticName;
    for (const v of opts.nameMap.types.values()) this.usedNames.add(v);
    for (const v of opts.nameMap.typePacks.values()) this.usedNames.add(v);
  }

  hasSeen(o: object): boolean {
    if (this.seen.has(o)) return true;
    this.seen.add(o);
    return false;
  }

  unsee(o: object): void {
    this.seen.delete(o);
  }

  getName(ty: TypeId): string {
    const s = this.opts.nameMap.types.size;
    const existing = this.opts.nameMap.types.get(ty);
    if (existing) return existing;
    const isForGeneric = get(follow(ty), "GenericType") !== undefined;
    for (let count = 0; count < 256; ++count) {
      const candidate = generateName(this.usedNames.size + count, isForGeneric);
      if (!this.usedNames.has(candidate)) {
        this.usedNames.add(candidate);
        this.opts.nameMap.types.set(ty, candidate);
        return candidate;
      }
    }
    return generateName(s, isForGeneric);
  }

  getPackName(tp: TypePackId): string {
    const s = this.opts.nameMap.typePacks.size;
    const existing = this.opts.nameMap.typePacks.get(tp);
    if (existing) return existing;
    const isForGeneric = getPack(followPack(tp), "GenericTypePack") !== undefined;
    for (let count = 0; count < 256; ++count) {
      const candidate = generateName(this.previousNameIndex + count, isForGeneric);
      if (!this.usedNames.has(candidate)) {
        this.previousNameIndex += count;
        this.usedNames.add(candidate);
        this.opts.nameMap.typePacks.set(tp, candidate);
        return candidate;
      }
    }
    return generateName(s, isForGeneric);
  }

  emit(s: string): void {
    if (this.opts.maxTypeLength > 0 && this.result.name.length > this.opts.maxTypeLength) return;
    this.result.name += s;
  }

  indent(): void {
    this.indentation += 4;
  }

  dedent(): void {
    this.indentation -= 4;
  }

  newline(): void {
    if (!this.opts.useLineBreaks) {
      this.emit(" ");
      return;
    }
    this.emit("\n");
    this.emit(" ".repeat(this.indentation));
  }
}

class TypeStringifier {
  constructor(readonly state: StringifierState) {}

  stringify(tv: TypeId): void {
    const state = this.state;
    if (state.opts.maxTypeLength > 0 && state.result.name.length > state.opts.maxTypeLength) return;
    const cycleName = state.cycleNames.get(tv);
    if (cycleName !== undefined) {
      state.emit(cycleName);
      return;
    }
    this.stringifyVariant(tv, tv.ty);
  }

  stringifyPack(tp: TypePackId, names?: (FunctionArgument | undefined)[]): void {
    new TypePackStringifier(this.state, names ?? []).stringify(tp);
  }

  emitKey(name: string): void {
    if (isIdentifier(name)) this.state.emit(name);
    else {
      this.state.emit('["');
      this.state.emit(escape(name));
      this.state.emit('"]');
    }
    this.state.emit(": ");
  }

  stringifyProperty(name: string, prop: Property): void {
    const state = this.state;
    if (prop.isShared()) {
      this.emitKey(name);
      this.stringify(prop.readTy!);
      return;
    }
    let comma = false;
    if (prop.readTy) {
      state.emit("read ");
      this.emitKey(name);
      this.stringify(prop.readTy);
      comma = true;
    }
    if (prop.writeTy) {
      if (comma) {
        state.emit(",");
        state.newline();
      }
      state.emit("write ");
      this.emitKey(name);
      this.stringify(prop.writeTy);
    }
  }

  stringifyTypeArguments(types: TypeId[], typePacks: TypePackId[]): void {
    const state = this.state;
    if (types.length === 0 && typePacks.length === 0) return;
    state.emit("<");
    let first = true;
    for (const ty of types) {
      if (!first) state.emit(", ");
      first = false;
      this.stringify(ty);
    }
    const singleTp = typePacks.length === 1;
    for (const tp of typePacks) {
      if (isEmpty(tp) && singleTp) continue;
      if (!first) state.emit(", ");
      else first = false;
      const wrap = !singleTp && getPack(followPack(tp), "TypePack") !== undefined && !isEmpty(tp);
      if (wrap) state.emit("(");
      this.stringifyPack(tp);
      if (wrap) state.emit(")");
    }
    state.emit(">");
  }

  stringifyVariant(ty: TypeId, v: TypeVariant): void {
    const state = this.state;
    switch (v.kind) {
      case "FreeType": {
        state.result.invalid = true;
        const lowerBound = follow(v.lowerBound);
        const upperBound = follow(v.upperBound);
        if (get(lowerBound, "NeverType") && get(upperBound, "UnknownType")) {
          state.emit("'");
          state.emit(state.getName(ty));
        } else {
          state.emit("(");
          if (!get(lowerBound, "NeverType")) {
            this.stringify(lowerBound);
            state.emit(" <: ");
          }
          state.emit("'");
          state.emit(state.getName(ty));
          if (!get(upperBound, "UnknownType")) {
            state.emit(" <: ");
            this.stringify(upperBound);
          }
          state.emit(")");
        }
        return;
      }
      case "BoundType":
        this.stringify(v.boundTo);
        return;
      case "GenericType":
        if (v.explicitName) {
          state.usedNames.add(v.name);
          state.opts.nameMap.types.set(ty, v.name);
          state.emit(v.name);
        } else {
          state.emit(state.getName(ty));
        }
        return;
      case "BlockedType":
        state.emit(`*blocked-${v.index}*`);
        return;
      case "PendingExpansionType":
        state.emit(`*pending-expansion-${v.index}*`);
        return;
      case "PrimitiveType":
        state.emit(primitiveName(v.type));
        return;
      case "SingletonType":
        if (v.variant.kind === "BooleanSingleton") state.emit(v.variant.value ? "true" : "false");
        else {
          state.emit('"');
          state.emit(escape(v.variant.value));
          state.emit('"');
        }
        return;
      case "FunctionType":
        this.stringifyFunction(v);
        return;
      case "TableType":
        this.stringifyTable(v);
        return;
      case "MetatableType":
        state.result.invalid = true;
        if (!state.exhaustive && v.syntheticName !== undefined) {
          state.emit(v.syntheticName);
          return;
        }
        state.emit("setmetatable<");
        this.stringify(v.table);
        state.emit(",");
        state.newline();
        this.stringify(v.metatable);
        state.emit(">");
        return;
      case "ExternType":
        state.emit(v.name);
        return;
      case "AnyType":
        state.emit("any");
        return;
      case "NoRefineType":
        state.emit("*no-refine*");
        return;
      case "UnionType":
        if (state.hasSeen(v)) {
          state.result.cycle = true;
          state.emit("*CYCLE*");
          return;
        }
        this.stringifyUnion(v);
        return;
      case "IntersectionType":
        this.stringifyIntersection(ty, v.parts);
        return;
      case "ErrorType":
        state.result.error = true;
        if (v.synthetic) {
          state.emit("*error-type<");
          this.stringify(v.synthetic);
          state.emit(">*");
        } else {
          state.emit("*error-type*");
        }
        return;
      case "LazyType":
        if (v.unwrapped) this.stringify(v.unwrapped);
        else {
          state.result.invalid = true;
          state.emit("lazy?");
        }
        return;
      case "UnknownType":
        state.emit("unknown");
        return;
      case "NeverType":
        state.emit("never");
        return;
      case "NegationType": {
        state.emit("~");
        const followed = follow(v.ty);
        const parens = get(followed, "UnionType") !== undefined || get(followed, "IntersectionType") !== undefined;
        if (parens) state.emit("(");
        this.stringify(v.ty);
        if (parens) state.emit(")");
        return;
      }
      case "TypeFunctionInstanceType": {
        state.emit(v.userFuncName ?? v.function.name);
        state.emit("<");
        let comma = false;
        for (const t of v.typeArguments) {
          if (comma) state.emit(", ");
          comma = true;
          this.stringify(t);
        }
        for (const tp of v.packArguments) {
          if (comma) state.emit(", ");
          comma = true;
          this.stringifyPack(tp);
        }
        state.emit(">");
        return;
      }
    }
  }

  private stringifyFunction(ftv: FunctionType): void {
    const state = this.state;
    if (state.hasSeen(ftv)) {
      state.result.cycle = true;
      state.emit("*CYCLE*");
      return;
    }
    if (ftv.generics.length > 0 || ftv.genericPacks.length > 0) {
      state.emit("<");
      let comma = false;
      for (const g of ftv.generics) {
        if (comma) state.emit(", ");
        comma = true;
        this.stringify(g);
      }
      for (const g of ftv.genericPacks) {
        if (comma) state.emit(", ");
        comma = true;
        this.stringifyPack(g);
      }
      state.emit(">");
    }
    if (ftv.isCheckedFunction) state.emit("@checked ");
    state.emit("(");
    if (!isEmpty(ftv.argTypes)) {
      if (state.opts.functionTypeArguments) this.stringifyPack(ftv.argTypes, ftv.argNames);
      else this.stringifyPack(ftv.argTypes);
    }
    state.emit(") -> ");
    let plural = !isEmpty(ftv.retTypes);
    const ret = flatten(ftv.retTypes);
    if (ret.head.length === 1 && !ret.tail) plural = false;
    if (plural) state.emit("(");
    this.stringifyPack(ftv.retTypes);
    if (plural) state.emit(")");
    state.unsee(ftv);
  }

  private stringifyTable(ttv: TableType): void {
    const state = this.state;
    if (ttv.boundTo) {
      this.stringify(ttv.boundTo);
      return;
    }
    const showName = !state.exhaustive || state.opts.hideTableAliasExpansions;
    if (showName && ttv.name !== undefined) {
      if (state.opts.scope) {
        const { success, moduleName } = canUseTypeNameInScope(state.opts.scope, ttv.name);
        if (!success) state.result.invalid = true;
        if (moduleName) {
          state.emit(moduleName);
          state.emit(".");
        }
      }
      state.emit(ttv.name);
      this.stringifyTypeArguments(ttv.instantiatedTypeParams, ttv.instantiatedTypePackParams);
      return;
    }
    if (!state.exhaustive && !state.ignoreSyntheticName && ttv.syntheticName !== undefined) {
      state.result.invalid = true;
      state.emit(ttv.syntheticName);
      this.stringifyTypeArguments(ttv.instantiatedTypeParams, ttv.instantiatedTypePackParams);
      return;
    }
    if (state.hasSeen(ttv)) {
      state.result.cycle = true;
      state.emit("*CYCLE*");
      return;
    }
    let openbrace = "@@@";
    let closedbrace = "@@@?!";
    switch (state.opts.hideTableKind ? TableState.Sealed : ttv.state) {
      case TableState.Sealed:
        openbrace = "{";
        closedbrace = "}";
        break;
      case TableState.Unsealed:
        state.result.invalid = true;
        openbrace = "{|";
        closedbrace = "|}";
        break;
      case TableState.Free:
        state.result.invalid = true;
        openbrace = "{-";
        closedbrace = "-}";
        break;
      case TableState.Generic:
        state.result.invalid = true;
        openbrace = "{+";
        closedbrace = "+}";
        break;
    }
    // An array prints as {T}.
    if (ttv.indexer && ttv.props.size === 0 && isNumber(ttv.indexer.indexType)) {
      state.emit("{");
      if (ttv.indexer.isReadOnly) state.emit("read ");
      this.stringify(ttv.indexer.indexResultType);
      state.emit("}");
      state.unsee(ttv);
      return;
    }
    state.emit(openbrace);
    state.indent();
    let comma = false;
    if (ttv.indexer) {
      state.newline();
      if (ttv.indexer.isReadOnly) state.emit("read ");
      state.emit("[");
      this.stringify(ttv.indexer.indexType);
      state.emit("]: ");
      this.stringify(ttv.indexer.indexResultType);
      comma = true;
    }
    let index = 0;
    const oldLength = state.result.name.length;
    const props = ttv.props.entries();
    for (const [name, prop] of props) {
      if (comma) state.emit(",");
      state.newline();
      const length = state.result.name.length - oldLength;
      if (state.opts.maxTableLength > 0 && length - 2 * index >= state.opts.maxTableLength) {
        state.emit(`... ${props.length - index} more ...`);
        break;
      }
      this.stringifyProperty(name, prop);
      comma = true;
      ++index;
    }
    state.dedent();
    if (comma) state.newline();
    else state.emit("  ");
    state.emit(closedbrace);
    state.unsee(ttv);
  }

  private collectElements(elements: TypeId[], needsParens: (el: TypeId) => boolean): { strings: string[]; limitHit: boolean } {
    const state = this.state;
    const strings: string[] = [];
    let resultsLength = 0;
    let limitHit = false;
    for (const el of elements) {
      const saved = state.result.name;
      state.result.name = "";
      const parens = !state.cycleNames.has(el) && needsParens(el);
      if (parens) state.emit("(");
      this.stringify(el);
      if (parens) state.emit(")");
      strings.push(state.result.name);
      resultsLength += state.result.name.length;
      state.result.name = saved;
      limitHit = state.opts.maxTypeLength > 0 && resultsLength > state.opts.maxTypeLength;
      if (limitHit) break;
    }
    return { strings, limitHit };
  }

  private stringifyUnion(uv: UnionType): void {
    const state = this.state;
    let optional = false;
    let hasNonNilDisjunct = false;
    const members: TypeId[] = [];
    for (let el of flatOptions(uv)) {
      el = follow(el);
      if (state.opts.useQuestionMarks && isNil(el)) {
        optional = true;
        continue;
      }
      hasNonNilDisjunct = true;
      members.push(el);
    }
    const { strings, limitHit } = this.collectElements(
      members,
      (el) => get(el, "IntersectionType") !== undefined || get(el, "FunctionType") !== undefined,
    );
    state.unsee(uv);
    if (!limitHit) strings.sort(compareStrings);
    if (optional && strings.length > 1) state.emit("(");
    const onNewlines = strings.length > state.opts.compositeTypesSingleLineLimit;
    strings.forEach((s, i) => {
      if (i > 0) {
        if (onNewlines) state.newline();
        else state.emit(" ");
        state.emit("| ");
      }
      state.emit(s);
    });
    if (optional) {
      let s = strings.length > 1 ? ")?" : "?";
      if (!hasNonNilDisjunct) s = "nil";
      state.emit(s);
    }
  }

  private stringifyIntersection(ty: TypeId, parts: TypeId[]): void {
    const state = this.state;
    const itv = ty.ty;
    if (state.hasSeen(itv)) {
      state.result.cycle = true;
      state.emit("*CYCLE*");
      return;
    }
    const { strings, limitHit } = this.collectElements(
      parts.map((p) => follow(p)),
      (el) => get(el, "UnionType") !== undefined || get(el, "FunctionType") !== undefined,
    );
    state.unsee(itv);
    if (!limitHit) strings.sort(compareStrings);
    const onNewlines = strings.length > state.opts.compositeTypesSingleLineLimit || isOverloadedFunction(ty);
    strings.forEach((s, i) => {
      if (i > 0) {
        if (onNewlines) state.newline();
        else state.emit(" ");
        state.emit("& ");
      }
      state.emit(s);
    });
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function primitiveName(type: PrimitiveKind): string {
  switch (type) {
    case PrimitiveKind.NilType:
      return "nil";
    case PrimitiveKind.Boolean:
      return "boolean";
    case PrimitiveKind.Number:
      return "number";
    case PrimitiveKind.Integer:
      return "integer";
    case PrimitiveKind.String:
      return "string";
    case PrimitiveKind.Thread:
      return "thread";
    case PrimitiveKind.Buffer:
      return "buffer";
    case PrimitiveKind.Function:
      return "function";
    case PrimitiveKind.Table:
      return "table";
  }
}

class TypePackStringifier {
  private elemIndex = 0;

  constructor(
    readonly state: StringifierState,
    readonly elemNames: (FunctionArgument | undefined)[],
  ) {}

  stringifyType(tv: TypeId): void {
    new TypeStringifier(this.state).stringify(tv);
  }

  stringify(tp: TypePackId): void {
    const state = this.state;
    if (state.opts.maxTypeLength > 0 && state.result.name.length > state.opts.maxTypeLength) return;
    const cycleName = state.cycleTpNames.get(tp);
    if (cycleName !== undefined) {
      state.emit(cycleName);
      return;
    }
    this.stringifyVariant(tp, tp.ty);
  }

  stringifyVariant(tp: TypePackId, v: TypePackVariant): void {
    const state = this.state;
    switch (v.kind) {
      case "TypePack": {
        if (state.hasSeen(v)) {
          state.result.cycle = true;
          state.emit("*CYCLETP*");
          return;
        }
        if (v.head.length === 0 && (!v.tail || isEmpty(v.tail))) {
          state.emit("()");
          state.unsee(v);
          return;
        }
        let first = true;
        for (const typeId of v.head) {
          if (first) first = false;
          else state.emit(", ");
          const name = this.elemNames[this.elemIndex];
          if (name) {
            state.emit(name.name);
            state.emit(": ");
          }
          this.elemIndex++;
          this.stringifyType(typeId);
        }
        if (v.tail && !isEmpty(v.tail)) {
          const tail = followPack(v.tail);
          const vtp = getPack(tail, "VariadicTypePack");
          if (!vtp || !vtp.hidden) {
            if (first) first = false;
            else state.emit(", ");
            this.stringify(tail);
          }
        }
        state.unsee(v);
        return;
      }
      case "ErrorTypePack":
        state.result.error = true;
        if (v.synthetic) {
          state.emit("*");
          this.stringify(v.synthetic);
          state.emit("*");
        } else {
          state.emit("*error-type*");
        }
        return;
      case "VariadicTypePack":
        state.emit("...");
        this.stringifyType(v.ty);
        return;
      case "GenericTypePack":
        if (v.explicitName) {
          state.usedNames.add(v.name);
          state.opts.nameMap.typePacks.set(tp, v.name);
          state.emit(v.name);
        } else {
          state.emit(state.getPackName(tp));
        }
        state.emit("...");
        return;
      case "FreeTypePack":
        state.result.invalid = true;
        state.emit(state.getPackName(tp));
        state.emit("...");
        return;
      case "BoundTypePack":
        this.stringify(v.boundTo);
        return;
      case "BlockedTypePack":
        state.emit(`*blocked-tp-${v.index}*`);
        return;
      case "TypeFunctionInstanceTypePack": {
        state.emit(v.function.name);
        state.emit("<");
        let comma = false;
        for (const p of v.typeArguments) {
          if (comma) state.emit(", ");
          comma = true;
          this.stringifyType(p);
        }
        for (const p of v.packArguments) {
          if (comma) state.emit(", ");
          comma = true;
          this.stringify(p);
        }
        state.emit(">");
        return;
      }
    }
  }
}

function assignCycleNames(cycles: TypeId[], cycleTPs: TypePackId[], state: StringifierState, exhaustive: boolean): void {
  let nextIndex = 1;
  const cycleSet = new Set(cycles);
  for (const cycleTy of cycles) {
    const ttv = get(follow(cycleTy), "TableType");
    if (!exhaustive && ttv && (ttv.syntheticName !== undefined || ttv.name !== undefined)) {
      // A named table whose type parameters are cyclic is named after itself.
      if (ttv.instantiatedTypeParams.some((el) => cycleSet.has(follow(el)))) {
        state.cycleNames.set(cycleTy, ttv.name ?? ttv.syntheticName!);
      }
      continue;
    }
    state.cycleNames.set(cycleTy, `t${nextIndex}`);
    ++nextIndex;
  }
  for (const tp of cycleTPs) {
    state.cycleTpNames.set(tp, `tp${nextIndex}`);
    ++nextIndex;
  }
}

function emitCycleDefinitions(state: StringifierState): void {
  const tvs = new TypeStringifier(state);
  let semi = false;
  const names = [...state.cycleNames.entries()].sort((a, b) => compareStrings(a[1], b[1]));
  for (const [cycleTy, name] of names) {
    if (semi) state.emit(" ; ");
    state.emit(name);
    state.emit(" = ");
    tvs.stringifyVariant(cycleTy, cycleTy.ty);
    semi = true;
  }
  const tpNames = [...state.cycleTpNames.entries()].sort((a, b) => compareStrings(a[1], b[1]));
  const tps = new TypePackStringifier(state, []);
  for (const [cycleTp, name] of tpNames) {
    if (semi) state.emit(" ; ");
    state.emit(name);
    state.emit(" = ");
    tps.stringifyVariant(cycleTp, cycleTp.ty);
    semi = true;
  }
}

function findCycles(root: TypeId | TypePackId, exhaustive: boolean): { cycles: TypeId[]; cycleTPs: TypePackId[] } {
  const fct = new FindCyclicTypes(exhaustive);
  if (isTypeId(root)) fct.traverse(root);
  else fct.traversePack(root);
  return { cycles: [...fct.cycles].sort(bySerial), cycleTPs: [...fct.cycleTPs].sort(bySerial) };
}

function isTypeId(x: TypeId | TypePackId): x is TypeId {
  const kind = x.ty.kind;
  return !kind.endsWith("TypePack") && kind !== "TypePack";
}

export function toStringDetailed(ty: TypeId, options: ToStringOptions = {}): ToStringResult {
  const opts = resolveOptions(options);
  ty = follow(ty);
  const result: ToStringResult = { name: "", invalid: false, error: false, cycle: false, truncated: false };
  const state = new StringifierState(opts, result);
  const { cycles, cycleTPs } = findCycles(ty, opts.exhaustive);
  assignCycleNames(cycles, cycleTPs, state, opts.exhaustive);
  const tvs = new TypeStringifier(state);

  if (!opts.exhaustive) {
    const ttv = get(ty, "TableType");
    const mtv = get(ty, "MetatableType");
    if (state.ignoreSyntheticName) {
      if (ttv && ttv.name !== undefined) {
        tableTypeToStringDetailed(ttv, false, result, opts.scope, ttv.name, tvs);
        return result;
      }
    } else if (ttv && (ttv.name !== undefined || ttv.syntheticName !== undefined)) {
      tableTypeToStringDetailed(ttv, true, result, opts.scope, ttv.name ?? ttv.syntheticName!, tvs);
      return result;
    } else if (mtv && mtv.syntheticName !== undefined) {
      result.invalid = true;
      result.name = mtv.syntheticName;
      return result;
    }
  }

  const rootName = state.cycleNames.get(ty);
  if (rootName !== undefined) state.emit(rootName);
  else tvs.stringify(ty);

  if (state.cycleNames.size || state.cycleTpNames.size) {
    result.cycle = true;
    state.emit(" where ");
  }
  state.exhaustive = true;
  emitCycleDefinitions(state);

  if (opts.maxTypeLength > 0 && result.name.length > opts.maxTypeLength) {
    result.truncated = true;
    result.name += "... *TRUNCATED*";
  }
  return result;
}

function tableTypeToStringDetailed(
  ttv: TableType,
  considerSyntheticName: boolean,
  result: ToStringResult,
  scope: Scope | undefined,
  nameToUse: string,
  tvs: TypeStringifier,
): void {
  if (considerSyntheticName && ttv.syntheticName !== undefined) result.invalid = true;
  if (ttv.name !== undefined && scope) {
    const { success, moduleName } = canUseTypeNameInScope(scope, ttv.name);
    if (!success) result.invalid = true;
    if (moduleName) result.name = `${moduleName}.`;
  }
  result.name += nameToUse;
  tvs.stringifyTypeArguments(ttv.instantiatedTypeParams, ttv.instantiatedTypePackParams);
}

export function toStringPackDetailed(tp: TypePackId, options: ToStringOptions = {}): ToStringResult {
  const opts = resolveOptions(options);
  const result: ToStringResult = { name: "", invalid: false, error: false, cycle: false, truncated: false };
  const state = new StringifierState(opts, result);
  const { cycles, cycleTPs } = findCycles(tp, opts.exhaustive);
  assignCycleNames(cycles, cycleTPs, state, opts.exhaustive);
  const tvs = new TypeStringifier(state);

  const rootName = state.cycleTpNames.get(tp);
  if (rootName !== undefined) state.emit(rootName);
  else tvs.stringifyPack(tp);

  if (cycles.length || cycleTPs.length) {
    result.cycle = true;
    state.emit(" where ");
  }
  state.exhaustive = true;
  emitCycleDefinitions(state);

  if (opts.maxTypeLength > 0 && result.name.length > opts.maxTypeLength) {
    result.name += "... *TRUNCATED*";
  }
  return result;
}

export function toString(ty: TypeId, options: ToStringOptions = {}): string {
  return toStringDetailed(ty, options).name;
}

export function toStringPack(tp: TypePackId, options: ToStringOptions = {}): string {
  return toStringPackDetailed(tp, options).name;
}

export function toStringTypeOrPack(x: TypeId | TypePackId, options: ToStringOptions = {}): string {
  return isTypeId(x) ? toString(x, options) : toStringPack(x, options);
}

/** A named function's signature, as `name(arg: T): R`. */
export function toStringNamedFunction(funcName: string, ftv: FunctionType, options: ToStringOptions = {}): string {
  const opts = resolveOptions(options);
  const result: ToStringResult = { name: "", invalid: false, error: false, cycle: false, truncated: false };
  const state = new StringifierState(opts, result);
  const tvs = new TypeStringifier(state);
  state.emit(funcName);
  if (!opts.hideNamedFunctionTypeParameters) tvs.stringifyTypeArguments(ftv.generics, ftv.genericPacks);
  state.emit("(");
  const args = flatten(ftv.argTypes);
  let first = true;
  args.head.forEach((argTy, idx) => {
    if (idx === 0 && ftv.hasSelf && opts.hideFunctionSelfArgument) return;
    if (!first) state.emit(", ");
    first = false;
    const override = opts.namedFunctionOverrideArgNames[idx];
    const argName = ftv.argNames[idx];
    if (override !== undefined) state.emit(`${override}: `);
    else if (argName) state.emit(`${argName.name}: `);
    else state.emit("_: ");
    tvs.stringify(argTy);
  });
  if (args.tail) {
    const vtp = getPack(args.tail, "VariadicTypePack");
    if (!vtp || !vtp.hidden) {
      if (!first) state.emit(", ");
      state.emit("...: ");
      if (vtp) tvs.stringify(vtp.ty);
      else tvs.stringifyPack(args.tail);
    }
  }
  state.emit("): ");
  const retSize = packSize(ftv.retTypes);
  const hasTail = !finite(ftv.retTypes);
  const wrap = getPack(followPack(ftv.retTypes), "TypePack") !== undefined && (hasTail ? retSize !== 0 : retSize > 1);
  if (wrap) state.emit("(");
  tvs.stringifyPack(ftv.retTypes);
  if (wrap) state.emit(")");
  return result.name;
}

export function toStringVector(types: TypeId[], options: ToStringOptions = {}): string {
  return types.map((t) => toString(t, options)).join(", ");
}
