// Copying types, ported from Luau's `Clone.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).

import {
  follow,
  followPack,
  Props,
  TableIndexer,
  TypeFun,
  type BuiltinTypes,
  type GenericTypeDefinition,
  type GenericTypePackDefinition,
  type TypeArena,
  type TypeId,
  type TypePackId,
  type TypePackVariant,
  type TypeVariant,
} from "./Type";

/** A copy of a variant whose own containers are fresh, referring to the same types. */
export function copyVariant(v: TypeVariant): TypeVariant {
  switch (v.kind) {
    case "FunctionType":
      return { ...v, generics: [...v.generics], genericPacks: [...v.genericPacks], argNames: [...v.argNames], tags: [...v.tags] };
    case "TableType":
      return {
        ...v,
        props: new Props(v.props.entries().map(([k, p]) => [k, p.clone()])),
        indexer: v.indexer ? new TableIndexer(v.indexer.indexType, v.indexer.indexResultType, v.indexer.isReadOnly) : undefined,
        instantiatedTypeParams: [...v.instantiatedTypeParams],
        instantiatedTypePackParams: [...v.instantiatedTypePackParams],
        tags: [...v.tags],
      };
    case "ExternType":
      return {
        ...v,
        props: new Props(v.props.entries().map(([k, p]) => [k, p.clone()])),
        indexer: v.indexer ? new TableIndexer(v.indexer.indexType, v.indexer.indexResultType, v.indexer.isReadOnly) : undefined,
        tags: [...v.tags],
      };
    case "UnionType":
      return { ...v, options: [...v.options] };
    case "IntersectionType":
      return { ...v, parts: [...v.parts] };
    case "TypeFunctionInstanceType":
      return { ...v, typeArguments: [...v.typeArguments], packArguments: [...v.packArguments] };
    case "PendingExpansionType":
      return { ...v, typeArguments: [...v.typeArguments], packArguments: [...v.packArguments] };
    case "SingletonType":
      return { ...v, variant: { ...v.variant } };
    case "AnyType":
    case "UnknownType":
    case "NeverType":
    case "NoRefineType":
      return v;
    default:
      return { ...v };
  }
}

export function copyPackVariant(v: TypePackVariant): TypePackVariant {
  switch (v.kind) {
    case "TypePack":
      return { ...v, head: [...v.head] };
    case "TypeFunctionInstanceTypePack":
      return { ...v, typeArguments: [...v.typeArguments], packArguments: [...v.packArguments] };
    default:
      return { ...v };
  }
}

/**
 * A new type holding a copy of a type's contents, as Luau's `shallowClone`
 * with a fresh clone state: its parts are shared, and a generic, free or
 * table type loses its scope.
 */
export function shallowClone(ty: TypeId, arena: TypeArena, clonePersistentTypes = false): TypeId {
  ty = follow(ty, false);
  if (ty.persistent && !clonePersistentTypes) return ty;
  const target = arena.addType(copyVariant(ty.ty));
  target.documentationSymbol = ty.documentationSymbol;
  const v = target.ty;
  if (v.kind === "GenericType" || v.kind === "FreeType" || v.kind === "TableType") v.scope = undefined;
  return target;
}

/**
 * Deep-copies a type graph into an arena, sharing persistent types, as
 * Luau's `clone`. `seenTypes` and `seenTypePacks` map originals to copies and
 * may be shared across calls to keep identities consistent.
 */
export class TypeCloner {
  readonly seenTypes = new Map<TypeId, TypeId>();
  readonly seenTypePacks = new Map<TypePackId, TypePackId>();

  constructor(
    readonly arena: TypeArena,
    readonly builtinTypes: BuiltinTypes,
  ) {}

  clone(ty: TypeId): TypeId {
    ty = follow(ty, false);
    if (ty.persistent) return ty;
    const found = this.seenTypes.get(ty);
    if (found) return found;
    const target = this.arena.addType(copyVariant(ty.ty));
    target.documentationSymbol = ty.documentationSymbol;
    this.seenTypes.set(ty, target);
    this.cloneChildren(target.ty);
    return target;
  }

  clonePack(tp: TypePackId): TypePackId {
    tp = followPack(tp);
    if (tp.persistent) return tp;
    const found = this.seenTypePacks.get(tp);
    if (found) return found;
    const target = this.arena.addTypePack(copyPackVariant(tp.ty));
    this.seenTypePacks.set(tp, target);
    const v = target.ty;
    switch (v.kind) {
      case "BoundTypePack":
        v.boundTo = this.clonePack(v.boundTo);
        break;
      case "VariadicTypePack":
        v.ty = this.clone(v.ty);
        break;
      case "TypePack":
        v.head = v.head.map((t) => this.clone(t));
        if (v.tail) v.tail = this.clonePack(v.tail);
        break;
      case "TypeFunctionInstanceTypePack":
        v.typeArguments = v.typeArguments.map((t) => this.clone(t));
        v.packArguments = v.packArguments.map((t) => this.clonePack(t));
        break;
      case "GenericTypePack":
      case "FreeTypePack":
        v.scope = undefined;
        break;
      default:
        break;
    }
    return target;
  }

  private cloneChildren(v: TypeVariant): void {
    switch (v.kind) {
      case "BoundType":
        v.boundTo = this.clone(v.boundTo);
        break;
      case "FreeType":
        v.lowerBound = this.clone(v.lowerBound);
        v.upperBound = this.clone(v.upperBound);
        if (v.primitiveType) v.primitiveType = this.clone(v.primitiveType);
        v.scope = undefined;
        break;
      case "GenericType":
        v.scope = undefined;
        break;
      case "FunctionType":
        v.generics = v.generics.map((g) => this.clone(g));
        v.genericPacks = v.genericPacks.map((g) => this.clonePack(g));
        v.argTypes = this.clonePack(v.argTypes);
        v.retTypes = this.clonePack(v.retTypes);
        break;
      case "TableType":
        v.scope = undefined;
        if (v.indexer) {
          v.indexer.indexType = this.clone(v.indexer.indexType);
          v.indexer.indexResultType = this.clone(v.indexer.indexResultType);
        }
        for (const [, p] of v.props) {
          if (p.readTy) p.readTy = this.clone(p.readTy);
          if (p.writeTy) p.writeTy = this.clone(p.writeTy);
        }
        v.instantiatedTypeParams = v.instantiatedTypeParams.map((t) => this.clone(t));
        v.instantiatedTypePackParams = v.instantiatedTypePackParams.map((t) => this.clonePack(t));
        if (v.boundTo) v.boundTo = this.clone(v.boundTo);
        break;
      case "MetatableType":
        v.table = this.clone(v.table);
        v.metatable = this.clone(v.metatable);
        break;
      case "ExternType":
        for (const [, p] of v.props) {
          if (p.readTy) p.readTy = this.clone(p.readTy);
          if (p.writeTy) p.writeTy = this.clone(p.writeTy);
        }
        if (v.parent) v.parent = this.clone(v.parent);
        if (v.metatable) v.metatable = this.clone(v.metatable);
        if (v.indexer) {
          v.indexer.indexType = this.clone(v.indexer.indexType);
          v.indexer.indexResultType = this.clone(v.indexer.indexResultType);
        }
        break;
      case "UnionType":
        v.options = v.options.map((t) => this.clone(t));
        break;
      case "IntersectionType":
        v.parts = v.parts.map((t) => this.clone(t));
        break;
      case "LazyType":
        if (v.unwrapped) v.unwrapped = this.clone(v.unwrapped);
        break;
      case "NegationType":
        v.ty = this.clone(v.ty);
        break;
      case "TypeFunctionInstanceType":
        v.typeArguments = v.typeArguments.map((t) => this.clone(t));
        v.packArguments = v.packArguments.map((t) => this.clonePack(t));
        break;
      default:
        break;
    }
  }
}

/** A copy of a type alias whose types are cloned (Luau's `clone` of a `TypeFun`). */
export function cloneTypeFun(typeFun: TypeFun, cloneState: TypeCloner): TypeFun {
  const typeParams: GenericTypeDefinition[] = [];
  for (const param of typeFun.typeParams) {
    const copy: GenericTypeDefinition = { ty: cloneState.clone(param.ty) };

    if (param.defaultValue) copy.defaultValue = cloneState.clone(param.defaultValue);
    typeParams.push(copy);
  }

  const typePackParams: GenericTypePackDefinition[] = [];
  for (const param of typeFun.typePackParams) {
    const copy: GenericTypePackDefinition = { tp: cloneState.clonePack(param.tp) };

    if (param.defaultValue) copy.defaultValue = cloneState.clonePack(param.defaultValue);
    typePackParams.push(copy);
  }

  const type = cloneState.clone(typeFun.type);

  return new TypeFun(type, typeParams, typePackParams, typeFun.definitionLocation);
}
