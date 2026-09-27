// Paths into types, ported from Luau's `TypePath.h`/`TypePath.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`). Subtyping records where inside two
// types a check failed as a pair of paths, and error messages render them in
// words ("the 1st parameter", "property `x`").

import { toHumanReadableIndex } from "./ToString";
import {
  flatOptions,
  flatten,
  follow,
  followPack,
  get,
  getMetatable,
  getPack,
  lookupExternTypeProp,
  Type,
  type BuiltinTypes,
  type TableIndexer,
  type TypeArena,
  type TypeId,
  type TypePack,
  type TypePackId,
} from "./Type";

export type TypeOrPack = TypeId | TypePackId;

export function isTypeId(x: TypeOrPack): x is TypeId {
  return x instanceof Type;
}

export const enum IndexVariant {
  Pack,
  Union,
  Intersection,
}

export const enum TypeField {
  Table,
  Metatable,
  LowerBound,
  UpperBound,
  IndexLookup,
  IndexResult,
  Negated,
  Variadic,
}

export const enum PackField {
  Arguments,
  Returns,
  Tail,
}

export type Component =
  | { readonly kind: "Property"; name: string; isRead: boolean }
  | { readonly kind: "Index"; index: number; variant: IndexVariant }
  | { readonly kind: "TypeField"; field: TypeField }
  | { readonly kind: "PackField"; field: PackField }
  | { readonly kind: "PackSlice"; startIndex: number }
  | { readonly kind: "Reduction"; resultType: TypeId }
  | { readonly kind: "GenericPackMapping"; mappedType: TypePackId };

export const Components = {
  prop(name: string, isRead = true): Component {
    return { kind: "Property", name, isRead };
  },
  index(index: number, variant = IndexVariant.Pack): Component {
    return { kind: "Index", index, variant };
  },
  field(field: TypeField): Component {
    return { kind: "TypeField", field };
  },
  pack(field: PackField): Component {
    return { kind: "PackField", field };
  },
  slice(startIndex: number): Component {
    return { kind: "PackSlice", startIndex };
  },
  reduction(resultType: TypeId): Component {
    return { kind: "Reduction", resultType };
  },
  mapping(mappedType: TypePackId): Component {
    return { kind: "GenericPackMapping", mappedType };
  },
};

export function componentsEqual(a: Component, b: Component): boolean {
  switch (a.kind) {
    case "Property":
      return b.kind === "Property" && a.name === b.name && a.isRead === b.isRead;
    case "Index":
      // As in Luau, an index compares by position only.
      return b.kind === "Index" && a.index === b.index;
    case "TypeField":
      return b.kind === "TypeField" && a.field === b.field;
    case "PackField":
      return b.kind === "PackField" && a.field === b.field;
    case "PackSlice":
      return b.kind === "PackSlice" && a.startIndex === b.startIndex;
    case "Reduction":
      return b.kind === "Reduction" && a.resultType === b.resultType;
    case "GenericPackMapping":
      return b.kind === "GenericPackMapping" && a.mappedType === b.mappedType;
  }
}

export class Path {
  constructor(readonly components: readonly Component[] = []) {}

  append(suffix: Path): Path {
    return new Path([...this.components, ...suffix.components]);
  }

  push(component: Component): Path {
    return new Path([...this.components, component]);
  }

  pushFront(component: Component): Path {
    return new Path([component, ...this.components]);
  }

  pop(): Path {
    if (this.empty()) return EMPTY_PATH;
    return new Path(this.components.slice(0, -1));
  }

  last(): Component | undefined {
    return this.components[this.components.length - 1];
  }

  empty(): boolean {
    return this.components.length === 0;
  }

  equals(other: Path): boolean {
    return this.components.length === other.components.length && this.components.every((c, i) => componentsEqual(c, other.components[i]!));
  }

  /** A key equal for equal paths. */
  key(): string {
    return this.components
      .map((c) => {
        switch (c.kind) {
          case "Property":
            return `p${c.isRead ? "r" : "w"}:${c.name}`;
          case "Index":
            return `i${c.index}`;
          case "TypeField":
            return `t${c.field}`;
          case "PackField":
            return `k${c.field}`;
          case "PackSlice":
            return `s${c.startIndex}`;
          case "Reduction":
            return `r${c.resultType.serial}`;
          case "GenericPackMapping":
            return `g${c.mappedType.serial}`;
        }
      })
      .join("/");
  }
}

export const EMPTY_PATH = new Path();

export class PathBuilder {
  readonly components: Component[] = [];

  build(): Path {
    return new Path(this.components);
  }

  readProp(name: string): this {
    this.components.push(Components.prop(name, true));
    return this;
  }

  writeProp(name: string): this {
    this.components.push(Components.prop(name, false));
    return this;
  }

  prop(name: string): this {
    this.components.push(Components.prop(name));
    return this;
  }

  index(i: number): this {
    this.components.push(Components.index(i));
    return this;
  }

  mt(): this {
    this.components.push(Components.field(TypeField.Metatable));
    return this;
  }

  lb(): this {
    this.components.push(Components.field(TypeField.LowerBound));
    return this;
  }

  ub(): this {
    this.components.push(Components.field(TypeField.UpperBound));
    return this;
  }

  indexKey(): this {
    this.components.push(Components.field(TypeField.IndexLookup));
    return this;
  }

  indexValue(): this {
    this.components.push(Components.field(TypeField.IndexResult));
    return this;
  }

  negated(): this {
    this.components.push(Components.field(TypeField.Negated));
    return this;
  }

  variadic(): this {
    this.components.push(Components.field(TypeField.Variadic));
    return this;
  }

  args(): this {
    this.components.push(Components.pack(PackField.Arguments));
    return this;
  }

  rets(): this {
    this.components.push(Components.pack(PackField.Returns));
    return this;
  }

  tail(): this {
    this.components.push(Components.pack(PackField.Tail));
    return this;
  }

  packSlice(startIndex: number): this {
    this.components.push(Components.slice(startIndex));
    return this;
  }

  mappedGenericPack(mappedType: TypePackId): this {
    this.components.push(Components.mapping(mappedType));
    return this;
  }
}

// Luau's `LuauTypePathMaximumTraverseSteps`.
const MAXIMUM_TRAVERSE_STEPS = 100;

function isSingletonTypePack(pack: TypePackId | undefined): boolean {
  const seen = new Set<TypePackId>();
  let foundElement = false;
  let steps = 0;
  while (pack && ++steps <= MAXIMUM_TRAVERSE_STEPS) {
    if (seen.has(pack)) return false;
    seen.add(pack);
    const bound = getPack(pack, "BoundTypePack");
    if (bound) {
      pack = bound.boundTo;
      continue;
    }
    const typePack = getPack(pack, "TypePack");
    if (!typePack || typePack.head.length > 1 || (foundElement && typePack.head.length > 0)) return false;
    foundElement = foundElement || typePack.head.length > 0;
    if (!typePack.tail) return foundElement;
    pack = typePack.tail;
  }
  return false;
}

export interface ReturnTypePackInfo {
  typePack: TypePackId;
  isSingular: boolean;
}

export interface TypePathRenderMetadata {
  returnTypePacks: Map<number, ReturnTypePackInfo>;
  enclosingNegation?: TypeId;
}

class TraversalState {
  current: TypeOrPack;
  steps = 0;
  encounteredErrorSuppression = false;

  constructor(
    root: TypeOrPack,
    readonly builtinTypes: BuiltinTypes,
    readonly arena: TypeArena,
  ) {
    this.current = root;
  }

  private updateCurrent(x: TypeOrPack): void {
    this.current = isTypeId(x) ? follow(x) : followPack(x);
  }

  private tooLong(): boolean {
    return ++this.steps > MAXIMUM_TRAVERSE_STEPS;
  }

  traverse(component: Component): boolean {
    switch (component.kind) {
      case "Property":
        return this.traverseProperty(component.name, component.isRead);
      case "Index":
        return this.traverseIndex(component.index);
      case "TypeField":
        return this.traverseTypeField(component.field);
      case "PackField":
        return this.traversePackField(component.field);
      case "PackSlice":
        return this.traversePackSlice(component.startIndex);
      case "Reduction":
        if (this.tooLong()) return false;
        this.updateCurrent(component.resultType);
        return true;
      case "GenericPackMapping":
        if (this.tooLong()) return false;
        this.updateCurrent(component.mappedType);
        return true;
    }
  }

  private traverseProperty(name: string, isRead: boolean): boolean {
    const currentType = this.current;
    if (!isTypeId(currentType)) return false;
    if (this.tooLong()) return false;
    let prop: { readTy?: TypeId; writeTy?: TypeId } | undefined;
    const t = get(currentType, "TableType");
    const c = get(currentType, "ExternType");
    const m = get(currentType, "MetatableType");
    if (t) prop = t.props.get(name);
    else if (c) prop = lookupExternTypeProp(c, name);
    else if (m) {
      // A metatable type's table takes priority over its metatable.
      const pinned = this.current;
      this.updateCurrent(m.table);
      if (this.traverseProperty(name, isRead)) return true;
      this.current = pinned;
    }
    if (!prop) {
      const mt = getMetatable(currentType, this.builtinTypes);
      if (mt) {
        this.updateCurrent(mt);
        if (!this.traverseProperty("__index", true)) return false;
        return this.traverseProperty(name, isRead);
      }
    }
    if (prop) {
      const maybeType = isRead ? prop.readTy : prop.writeTy;
      if (maybeType) {
        this.updateCurrent(maybeType);
        return true;
      }
    }
    return false;
  }

  private traverseIndex(index: number): boolean {
    if (this.tooLong()) return false;
    const current = this.current;
    if (isTypeId(current)) {
      let updated = false;
      if (get(current, "ErrorType")) {
        this.encounteredErrorSuppression = true;
        return false;
      }
      const u = get(current, "UnionType");
      const i = get(current, "IntersectionType");
      const members = u ? flatOptions(u) : i ? flatOptions(i) : undefined;
      if (members) {
        // Every member is checked for an error type, whatever the index.
        members.forEach((m, idx) => {
          if (get(m, "ErrorType")) this.encounteredErrorSuppression = true;
          if (idx === index) {
            this.updateCurrent(m);
            updated = true;
          }
        });
      }
      return updated;
    }
    if (getPack(current, "TypePack")) {
      const { head } = flatten(current);
      const ty = head[index];
      if (ty) {
        this.updateCurrent(ty);
        return true;
      }
    }
    return false;
  }

  private traverseTypeField(field: TypeField): boolean {
    if (this.tooLong()) return false;
    const current = this.current;
    switch (field) {
      case TypeField.Table: {
        const mt = isTypeId(current) ? get(current, "MetatableType") : undefined;
        if (mt) {
          this.updateCurrent(mt.table);
          return true;
        }
        return false;
      }
      case TypeField.Metatable:
        if (isTypeId(current)) {
          const mt = getMetatable(current, this.builtinTypes);
          if (mt) {
            this.updateCurrent(mt);
            return true;
          }
        }
        return false;
      case TypeField.LowerBound:
      case TypeField.UpperBound: {
        const ft = isTypeId(current) ? get(current, "FreeType") : undefined;
        if (ft) {
          this.updateCurrent(field === TypeField.LowerBound ? ft.lowerBound : ft.upperBound);
          return true;
        }
        return false;
      }
      case TypeField.IndexLookup:
      case TypeField.IndexResult: {
        if (!isTypeId(current)) return false;
        let indexer: TableIndexer | undefined;
        const tt = get(current, "TableType");
        const mt = get(current, "MetatableType");
        const ct = get(current, "ExternType");
        if (tt && tt.indexer) indexer = tt.indexer;
        else if (mt) {
          indexer = get(follow(mt.table), "TableType")?.indexer ?? get(follow(mt.metatable), "TableType")?.indexer;
        } else if (ct && ct.indexer) indexer = ct.indexer;
        if (indexer) {
          this.updateCurrent(field === TypeField.IndexLookup ? indexer.indexType : indexer.indexResultType);
          return true;
        }
        return false;
      }
      case TypeField.Negated: {
        const nt = isTypeId(current) ? get(current, "NegationType") : undefined;
        if (nt) {
          this.updateCurrent(nt.ty);
          return true;
        }
        return false;
      }
      case TypeField.Variadic: {
        const vtp = !isTypeId(current) ? getPack(current, "VariadicTypePack") : undefined;
        if (vtp) {
          this.updateCurrent(vtp.ty);
          return true;
        }
        return false;
      }
    }
  }

  private traversePackField(field: PackField): boolean {
    if (this.tooLong()) return false;
    const current = this.current;
    switch (field) {
      case PackField.Arguments:
      case PackField.Returns: {
        const ft = isTypeId(current) ? get(current, "FunctionType") : undefined;
        if (ft) {
          this.updateCurrent(field === PackField.Arguments ? ft.argTypes : ft.retTypes);
          return true;
        }
        return false;
      }
      case PackField.Tail:
        if (!isTypeId(current)) {
          const tail = flatten(current).tail;
          if (tail) {
            this.updateCurrent(tail);
            return true;
          }
        }
        return false;
    }
  }

  private traversePackSlice(startIndex: number): boolean {
    if (this.tooLong()) return false;
    const current = this.current;
    if (isTypeId(current)) return false;
    const { head, tail } = flatten(current);
    if (head.length <= startIndex) return false;
    this.updateCurrent(this.arena.addTypePack(head.slice(startIndex), tail));
    return true;
  }
}

function traverseState(state: TraversalState, path: Path, renderMetadata?: TypePathRenderMetadata): boolean {
  const components = path.components;
  for (let i = 0; i < components.length; ++i) {
    const component = components[i]!;
    if (renderMetadata) {
      if (i > 0) {
        const prev = components[i - 1]!;
        if (
          prev.kind === "PackField" &&
          prev.field === PackField.Returns &&
          component.kind === "Index" &&
          component.variant === IndexVariant.Pack &&
          component.index === 0 &&
          !isTypeId(state.current)
        ) {
          if (!renderMetadata.returnTypePacks.has(i)) {
            renderMetadata.returnTypePacks.set(i, { typePack: state.current, isSingular: isSingletonTypePack(state.current) });
          }
        }
      }
      if (i + 1 === components.length && component.kind === "TypeField" && component.field === TypeField.Negated) {
        if (isTypeId(state.current) && get(follow(state.current), "NegationType")) renderMetadata.enclosingNegation = state.current;
      }
    }
    if (!state.traverse(component)) return false;
  }
  return true;
}

export function deriveRenderMetadata(root: TypeOrPack, path: Path, builtinTypes: BuiltinTypes, arena: TypeArena): TypePathRenderMetadata {
  const state = new TraversalState(isTypeId(root) ? follow(root) : followPack(root), builtinTypes, arena);
  const options: TypePathRenderMetadata = { returnTypePacks: new Map() };
  traverseState(state, path, options);
  return options;
}

/** The type or pack a path reaches from a root, as Luau's `traverse`; error suppression yields the error type for a pack root. */
export function traverse(
  root: TypeOrPack,
  path: Path,
  builtinTypes: BuiltinTypes,
  arena: TypeArena,
  renderMetadata?: TypePathRenderMetadata,
): TypeOrPack | undefined {
  const rootIsType = isTypeId(root);
  const state = new TraversalState(rootIsType ? follow(root) : followPack(root), builtinTypes, arena);
  if (!traverseState(state, path, renderMetadata)) return undefined;
  if (!rootIsType && state.encounteredErrorSuppression) return builtinTypes.errorType;
  return state.current;
}

export function traverseForType(root: TypeOrPack, path: Path, builtinTypes: BuiltinTypes, arena: TypeArena): TypeId | undefined {
  const state = new TraversalState(isTypeId(root) ? follow(root) : followPack(root), builtinTypes, arena);
  if (!traverseState(state, path)) return undefined;
  if (state.encounteredErrorSuppression) return builtinTypes.errorType;
  return isTypeId(state.current) ? state.current : undefined;
}

export function traverseForPack(root: TypeOrPack, path: Path, builtinTypes: BuiltinTypes, arena: TypeArena): TypePackId | undefined {
  const state = new TraversalState(isTypeId(root) ? follow(root) : followPack(root), builtinTypes, arena);
  if (!traverseState(state, path)) return undefined;
  if (state.encounteredErrorSuppression) return builtinTypes.errorTypePack;
  return isTypeId(state.current) ? undefined : state.current;
}

/** The pack index a path names when it is only pack slices followed by an index. */
export function traverseForIndex(path: Path): number | undefined {
  const components = path.components;
  if (components.length === 0) return undefined;
  let index = 0;
  for (let i = 0; i < components.length - 1; i++) {
    const c = components[i]!;
    if (c.kind !== "PackSlice") return undefined;
    index += c.startIndex;
  }
  const last = components[components.length - 1]!;
  if (last.kind === "Index") return index + last.index;
  return undefined;
}

export function flattenPackWithPath(root: TypePackId, path: Path): TypePack {
  const flattened: TypeId[] = [];
  let curr: TypePackId | undefined = root;
  let pathIndex = 0;
  const components = path.components;
  while (curr) {
    const f = flatten(curr);
    flattened.push(...f.head);
    curr = f.tail;
    if (!curr || !getPack(curr, "GenericTypePack") || pathIndex >= components.length) break;
    const pf = components[pathIndex]!;
    if (pf.kind !== "PackField" || pf.field !== PackField.Tail) break;
    ++pathIndex;
    const gpm = components[pathIndex];
    if (!gpm || gpm.kind !== "GenericPackMapping") break;
    ++pathIndex;
    curr = gpm.mappedType;
  }
  return { kind: "TypePack", head: flattened, tail: curr };
}

export function traverseForFlattenedPack(root: TypeId, path: Path, builtinTypes: BuiltinTypes, arena: TypeArena): TypePack {
  const components = path.components;
  let splitIndex = 0;
  for (let i = components.length; i > 0; --i) {
    const c = components[i - 1]!;
    const isNotTail = c.kind !== "PackField" || c.field !== PackField.Tail;
    const isNotGPM = c.kind !== "GenericPackMapping";
    if (isNotTail && isNotGPM) {
      splitIndex = i;
      break;
    }
  }
  if (splitIndex === components.length || splitIndex === 0) return { kind: "TypePack", head: [] };
  const basePack = traverseForPack(root, new Path(components.slice(0, splitIndex)), builtinTypes, arena);
  if (!basePack) return { kind: "TypePack", head: [] };
  return flattenPackWithPath(basePack, new Path(components.slice(splitIndex)));
}

export function matchesPrefix(prefix: Path, full: Path): boolean {
  if (prefix.components.length > full.components.length) return false;
  return prefix.components.every((c, i) => componentsEqual(c, full.components[i]!));
}

/** The path in Luau's compact notation, as `[read "x"].returns()`. */
export function pathToString(path: Path, prefixDot = false): string {
  let result = "";
  let firstComponent = true;
  for (const c of path.components) {
    switch (c.kind) {
      case "Property":
        result += `[${c.isRead ? "read " : "write "}"${c.name}"]`;
        break;
      case "Index":
        result += `[${c.index}]`;
        break;
      case "TypeField":
        if (!firstComponent || prefixDot) result += ".";
        result += ["table", "metatable", "lowerBound", "upperBound", "indexer", "indexResult", "negated", "variadic"][c.field]! + "()";
        break;
      case "PackField":
        if (!firstComponent || prefixDot) result += ".";
        result += ["arguments", "returns", "tail"][c.field]! + "()";
        break;
      case "PackSlice":
        result += `[${c.startIndex}:]`;
        break;
      case "Reduction":
        result += "~~>";
        break;
      case "GenericPackMapping":
        result += "~";
        break;
    }
    firstComponent = false;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Rendering a path in words
// ---------------------------------------------------------------------------

export interface RenderedTypePath {
  subject: string;
  prefix: string;
  enclosingNegation?: TypeId;
}

const enum Kind {
  None,
  Property,
  Metatable,
  Table,
  IndexMember,
  PackEntry,
  Parameter,
  ReturnValue,
  ReturnType,
  ParameterTypes,
  ReturnTypes,
  Tail,
  Variadic,
  PackSlice,
  Reduction,
  MappedPack,
  IndexerResult,
  Other,
}

interface Phrase {
  kind: Kind;
  text: string;
  /** A write property's alternate form, for a phrase built on top of it. */
  nestedText: string;
  propertyIsRead: boolean;
  propertyPrefix: string;
  propertyName: string;
  functionOwner: string;
  tailOwner?: PackField;
  mappedPackEntryOwner: string;
  mappedPackIsTail: boolean;
  plural: boolean;
  terminalOverride: string;
}

function emptyPhrase(): Phrase {
  return {
    kind: Kind.None,
    text: "",
    nestedText: "",
    propertyIsRead: true,
    propertyPrefix: "",
    propertyName: "",
    functionOwner: "",
    mappedPackEntryOwner: "",
    mappedPackIsTail: false,
    plural: false,
    terminalOverride: "",
  };
}

class RenderTypePath {
  current = emptyPhrase();
  componentIndex = 0;

  constructor(readonly options: TypePathRenderMetadata) {}

  render(component: Component, index: number): void {
    this.componentIndex = index;
    switch (component.kind) {
      case "Property":
        return this.renderProperty(component.name, component.isRead);
      case "Index":
        return this.renderIndex(component.index, component.variant);
      case "TypeField":
        return this.renderTypeField(component.field);
      case "PackField":
        return this.renderPackField(component.field);
      case "PackSlice":
        return this.renderPackSlice(component.startIndex);
      case "Reduction": {
        const next = emptyPhrase();
        next.kind = Kind.Reduction;
        next.text = this.current.nestedText ? `the reduced form of ${this.current.nestedText}` : "the reduced type";
        next.nestedText = next.text;
        this.current = next;
        return;
      }
      case "GenericPackMapping":
        return this.renderMapping();
    }
  }

  private renderProperty(name: string, isRead: boolean): void {
    const current = this.current;
    const next = emptyPhrase();
    next.kind = Kind.Property;
    next.propertyIsRead = isRead;
    if (current.kind === Kind.Property && current.propertyIsRead) {
      next.propertyPrefix = current.propertyPrefix;
      next.propertyName = `${current.propertyName}.${name}`;
    } else {
      next.propertyName = name;
      if (current.kind === Kind.Metatable) next.propertyPrefix = `in ${current.text}`;
      else if (current.kind === Kind.IndexMember || current.kind === Kind.IndexerResult) next.propertyPrefix = `in ${current.text}`;
      else if (current.kind !== Kind.None) next.propertyPrefix = `of ${current.nestedText || current.text}`;
    }
    next.text = `property \`${next.propertyName}\``;
    if (next.propertyPrefix) next.text += ` ${next.propertyPrefix}`;
    next.nestedText = next.text;
    if (!next.propertyIsRead) next.nestedText = `a value assigned to ${next.text}`;
    this.current = next;
  }

  private renderIndex(index: number, variant: IndexVariant): void {
    if (variant !== IndexVariant.Pack) return;
    const current = this.current;
    const next = emptyPhrase();
    const position = toHumanReadableIndex(index);
    const context = current.nestedText || current.text;
    switch (current.kind) {
      case Kind.ParameterTypes:
        next.kind = Kind.Parameter;
        next.text = `the ${position} parameter`;
        if (current.functionOwner) next.text += ` of ${current.functionOwner}`;
        break;
      case Kind.ReturnTypes: {
        const info = this.options.returnTypePacks.get(this.componentIndex);
        if (info && info.isSingular) {
          next.kind = Kind.ReturnType;
          next.text = "the return type";
        } else {
          next.kind = Kind.ReturnValue;
          next.text = `the ${position} return value`;
        }
        if (current.functionOwner) next.text += ` of ${current.functionOwner}`;
        break;
      }
      case Kind.MappedPack:
        next.kind = Kind.PackEntry;
        next.text = `the ${position} entry of ${current.mappedPackEntryOwner}`;
        break;
      default:
        next.kind = Kind.PackEntry;
        next.text = `the ${position} type pack entry`;
        if (context) next.text += ` of ${context}`;
        break;
    }
    next.nestedText = next.text;
    this.current = next;
  }

  private renderTypeField(field: TypeField): void {
    const current = this.current;
    const next = emptyPhrase();
    const context = current.nestedText || current.text;
    const of = context ? ` of ${context}` : "";
    switch (field) {
      case TypeField.Table:
        next.kind = Kind.Table;
        next.text = `the table portion${of}`;
        break;
      case TypeField.Metatable:
        next.kind = Kind.Metatable;
        next.text = `the metatable${of}`;
        if (current.kind === Kind.Property) {
          next.terminalOverride = current.text + (current.propertyIsRead ? " has metatable " : " accepts values with metatable ");
        }
        break;
      case TypeField.LowerBound:
        next.kind = Kind.Other;
        next.text = `the lower bound${of}`;
        break;
      case TypeField.UpperBound:
        next.kind = Kind.Other;
        next.text = `the upper bound${of}`;
        break;
      case TypeField.IndexLookup:
        next.kind = Kind.Other;
        next.text = `the indexer key type${of}`;
        break;
      case TypeField.IndexResult:
        next.kind = Kind.IndexerResult;
        next.text = `the indexer result${of}`;
        break;
      case TypeField.Negated:
        next.kind = Kind.Other;
        next.text = `the negated type${context ? ` in ${context}` : ""}`;
        break;
      case TypeField.Variadic:
        next.kind = Kind.Variadic;
        next.functionOwner = current.functionOwner;
        if (current.kind === Kind.Tail && current.tailOwner === PackField.Arguments) next.text = "the variadic parameter";
        else if (current.kind === Kind.Tail && current.tailOwner === PackField.Returns) next.text = "the variadic return value";
        else next.text = "the variadic tail";
        if (next.functionOwner) next.text += ` of ${next.functionOwner}`;
        break;
    }
    next.nestedText = next.text;
    this.current = next;
  }

  private renderPackField(field: PackField): void {
    const current = this.current;
    const next = emptyPhrase();
    const context = current.nestedText || current.text;
    switch (field) {
      case PackField.Tail:
        next.kind = Kind.Tail;
        if (current.kind === Kind.ParameterTypes) next.tailOwner = PackField.Arguments;
        else if (current.kind === Kind.ReturnTypes) next.tailOwner = PackField.Returns;
        next.functionOwner = current.functionOwner;
        if (next.tailOwner === PackField.Arguments) {
          next.text = `the parameter type pack tail${next.functionOwner ? ` of ${next.functionOwner}` : ""}`;
        } else if (next.tailOwner === PackField.Returns) {
          next.text = `the return type pack tail${next.functionOwner ? ` of ${next.functionOwner}` : ""}`;
        } else {
          next.text = `the type pack's tail${context ? ` of ${context}` : ""}`;
        }
        break;
      case PackField.Arguments:
        next.kind = Kind.ParameterTypes;
        next.text = "the parameter types";
        break;
      case PackField.Returns:
        next.kind = Kind.ReturnTypes;
        next.text = "the return types";
        break;
    }
    if (field !== PackField.Tail) {
      if (current.kind === Kind.Metatable) next.functionOwner = "the metatable function";
      else if (current.kind === Kind.Property && !current.propertyIsRead) {
        next.functionOwner = `a function assigned to \`${current.propertyName}\``;
        if (current.propertyPrefix) next.functionOwner += ` ${current.propertyPrefix}`;
      } else if (current.kind === Kind.ReturnType) next.functionOwner = "the function returned by this function";
      else if (current.kind !== Kind.None) next.functionOwner = context;
      if (next.functionOwner) next.text += ` of ${next.functionOwner}`;
    }
    next.nestedText = next.text;
    this.current = next;
  }

  private renderPackSlice(startIndex: number): void {
    const current = this.current;
    const next = emptyPhrase();
    next.kind = Kind.PackSlice;
    const position = toHumanReadableIndex(startIndex);
    switch (current.kind) {
      case Kind.ParameterTypes:
        next.plural = true;
        if (current.functionOwner === "the metatable function") {
          next.text = `the metatable function's parameters from the ${position} onward`;
        } else {
          next.text = "the parameters";
          if (current.functionOwner) next.text += ` of ${current.functionOwner}`;
          next.text += ` from the ${position} onward`;
        }
        break;
      case Kind.ReturnTypes:
        next.plural = true;
        if (current.functionOwner === "the metatable function") {
          next.text = `the metatable function's return values from the ${position} onward`;
        } else {
          next.text = "the return values";
          if (current.functionOwner) next.text += ` of ${current.functionOwner}`;
          next.text += ` from the ${position} onward`;
        }
        break;
      case Kind.MappedPack:
        if (current.tailOwner === PackField.Arguments) next.text = "the substituted parameter tail";
        else if (current.tailOwner === PackField.Returns) next.text = "the substituted return tail";
        else if (current.mappedPackIsTail) next.text = "the substituted type pack tail";
        else next.text = "the substituted type pack";
        if (current.functionOwner) next.text += ` for ${current.functionOwner}`;
        next.text += `, from its ${position} entry onward,`;
        break;
      default:
        next.text = `the type pack from its ${position} entry onward`;
    }
    next.nestedText = next.text;
    this.current = next;
  }

  private renderMapping(): void {
    const current = this.current;
    const next = emptyPhrase();
    next.kind = Kind.MappedPack;
    if (current.kind === Kind.Tail) {
      next.mappedPackIsTail = true;
      next.tailOwner = current.tailOwner;
      next.functionOwner = current.functionOwner;
      const owner = next.functionOwner ? ` of ${next.functionOwner}` : "";
      if (current.tailOwner === PackField.Arguments) {
        next.text = `the parameter type pack tail${owner}`;
        next.mappedPackEntryOwner = `the substituted parameter type pack tail${owner}`;
      } else if (current.tailOwner === PackField.Returns) {
        next.text = `the return type pack tail${owner}`;
        next.mappedPackEntryOwner = `the substituted return type pack tail${owner}`;
      } else {
        next.text = "the type pack tail";
        next.mappedPackEntryOwner = "the substituted type pack tail";
      }
    } else {
      next.text = "the generic type pack";
      next.mappedPackEntryOwner = "the substituted type pack";
    }
    next.nestedText = next.text;
    this.current = next;
  }

  finalize(): RenderedTypePath {
    const current = this.current;
    let subject = current.text;
    if (current.kind === Kind.Property && !current.propertyIsRead) subject = `values assigned to ${current.text}`;
    if (current.terminalOverride) return { subject, prefix: current.terminalOverride };
    switch (current.kind) {
      case Kind.None:
        return { subject: "", prefix: "" };
      case Kind.Property:
        return { subject, prefix: current.propertyIsRead ? `${current.text} has type ` : `${current.text} accepts values of type ` };
      case Kind.Parameter:
      case Kind.ReturnValue:
        return { subject, prefix: `${current.text} has type ` };
      case Kind.ParameterTypes:
      case Kind.ReturnTypes:
        return { subject, prefix: `${current.text} are ` };
      case Kind.PackSlice:
        return { subject, prefix: current.plural ? `${current.text} are ` : `${current.text} is ` };
      case Kind.Variadic:
        return { subject, prefix: current.text === "the variadic tail" ? `${current.text} has element type ` : `${current.text} has type ` };
      case Kind.MappedPack:
        return { subject, prefix: `${current.text} is substituted with ` };
      default:
        return { subject, prefix: `${current.text} is ` };
    }
  }
}

export function renderTypePath(path: Path, options: TypePathRenderMetadata = { returnTypePacks: new Map() }): RenderedTypePath {
  const renderer = new RenderTypePath(options);
  path.components.forEach((c, i) => renderer.render(c, i));
  const result = renderer.finalize();
  result.enclosingNegation = options.enclosingNegation;
  return result;
}
