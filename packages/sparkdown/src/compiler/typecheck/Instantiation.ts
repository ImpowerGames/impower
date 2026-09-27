// Instantiating generic function types, ported from the parts of Luau's
// `Instantiation.h`/`Instantiation.cpp` the new solver uses; Luau is
// MIT-licensed (see `LICENSE-luau.txt`). `GenericTypeFinder`, which Luau
// declares in `Instantiation.h`, lives in `Module.ts`.

import { shallowClone } from "./Clone";
import { Replacer } from "./Instantiation2";
import type { Scope } from "./Scope";
import { Substitution } from "./Substitution";
import {
  follow,
  followPack,
  freeType,
  freeTypePack,
  freshType,
  functionType,
  get,
  getPack,
  TableIndexer,
  TableState,
  tableType,
  TypeLevel,
  type BuiltinTypes,
  type TypeArena,
  type TypeId,
  type TypePackId,
} from "./Type";
import type { TypeCheckLimits } from "./TypeFunction";

/** A copy of a level, as Luau copies the `TypeLevel` value into each type it makes. */
function copyLevel(level: TypeLevel): TypeLevel {
  return new TypeLevel(level.level, level.subLevel);
}

function sameElements<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A substitution that replaces the generics of a given set, and generic tables, with free types. */
export class ReplaceGenerics extends Substitution {
  builtinTypes: BuiltinTypes;
  level: TypeLevel;
  scope: Scope | undefined;
  generics: TypeId[];
  genericPacks: TypePackId[];

  constructor(
    arena: TypeArena,
    builtinTypes: BuiltinTypes,
    level: TypeLevel,
    scope: Scope | undefined,
    generics: TypeId[],
    genericPacks: TypePackId[],
  ) {
    super(arena);
    this.builtinTypes = builtinTypes;
    this.level = level;
    this.scope = scope;
    this.generics = [...generics];
    this.genericPacks = [...genericPacks];
  }

  /**
   * Luau's `ReplaceGenerics::resetState`, which hides `Substitution::resetState`
   * there; TypeScript cannot override a method with more parameters under
   * the same name.
   */
  resetStateWith(
    arena: TypeArena,
    builtinTypes: BuiltinTypes,
    level: TypeLevel,
    scope: Scope | undefined,
    generics: TypeId[],
    genericPacks: TypePackId[],
  ): void {
    this.resetState(arena);

    this.builtinTypes = builtinTypes;

    this.level = level;
    this.scope = scope;

    this.generics = [...generics];
    this.genericPacks = [...genericPacks];
  }

  override ignoreChildren(ty: TypeId): boolean {
    const ftv = get(ty, "FunctionType");
    if (ftv) {
      if (ftv.hasNoFreeOrGenericTypes) return true;

      // A generic function that binds these same generics is not recursed
      // into, as happens with recursive types: if T = <a>(a, T) -> T, then
      // instantiating T gives T' = (X, T) -> T, not T' = (X, T') -> T'.
      // Comparing the lists is enough, as quantifying always makes fresh
      // generics, so two lists overlap only when they are equal.
      return (
        (this.generics.length !== 0 || this.genericPacks.length !== 0) &&
        sameElements(ftv.generics, this.generics) &&
        sameElements(ftv.genericPacks, this.genericPacks)
      );
    } else if (get(ty, "ExternType")) return true;
    else {
      return false;
    }
  }

  isDirty(ty: TypeId): boolean {
    const ttv = get(ty, "TableType");
    if (ttv) return ttv.state === TableState.Generic;
    else if (get(ty, "GenericType")) return this.generics.includes(ty);
    else return false;
  }

  isDirtyPack(tp: TypePackId): boolean {
    if (getPack(tp, "GenericTypePack")) return this.genericPacks.includes(tp);
    else return false;
  }

  clean(ty: TypeId): TypeId {
    const ttv = get(ty, "TableType");
    if (ttv) {
      const clone = tableType({
        props: ttv.props.clone(),
        indexer: ttv.indexer ? new TableIndexer(ttv.indexer.indexType, ttv.indexer.indexResultType, ttv.indexer.isReadOnly) : undefined,
        level: copyLevel(this.level),
        scope: this.scope,
        state: TableState.Free,
      });
      clone.definitionModuleName = ttv.definitionModuleName;
      clone.definitionLocation = ttv.definitionLocation;
      return this.arena.addType(clone);
    } else {
      // Luau's `TypeArena::freshType` at a level.
      return this.arena.addType({
        ...freeType(this.scope, this.builtinTypes.neverType, this.builtinTypes.unknownType),
        level: copyLevel(this.level),
      });
    }
  }

  cleanPack(_tp: TypePackId): TypePackId {
    return this.arena.addTypePack({ ...freeTypePack(this.scope), level: copyLevel(this.level) });
  }
}

/** A substitution that replaces generic functions with monomorphic ones. */
export class Instantiation extends Substitution {
  builtinTypes: BuiltinTypes;
  level: TypeLevel;
  scope: Scope | undefined;
  reusableReplaceGenerics: ReplaceGenerics;

  constructor(arena: TypeArena, builtinTypes: BuiltinTypes, level: TypeLevel, scope: Scope | undefined) {
    super(arena);
    this.builtinTypes = builtinTypes;
    this.level = level;
    this.scope = scope;
    this.reusableReplaceGenerics = new ReplaceGenerics(arena, builtinTypes, level, scope, [], []);
  }

  isDirty(ty: TypeId): boolean {
    const ftv = get(ty, "FunctionType");
    if (ftv) {
      if (ftv.hasNoFreeOrGenericTypes) return false;

      return true;
    } else {
      return false;
    }
  }

  isDirtyPack(_tp: TypePackId): boolean {
    return false;
  }

  override ignoreChildren(ty: TypeId): boolean {
    if (get(ty, "FunctionType")) return true;
    else if (get(ty, "ExternType")) return true;
    else return false;
  }

  clean(ty: TypeId): TypeId {
    const ftv = get(ty, "FunctionType")!;

    const clone = functionType(ftv.argTypes, ftv.retTypes, { level: copyLevel(this.level), definition: ftv.definition, hasSelf: ftv.hasSelf });
    clone.magic = ftv.magic;
    clone.tags = [...ftv.tags];
    clone.argNames = [...ftv.argNames];
    clone.isDeprecatedFunction = ftv.isDeprecatedFunction;
    let result = this.arena.addType(clone);

    // This runs even without generics, to replace any generic tables.
    this.reusableReplaceGenerics.resetStateWith(this.arena, this.builtinTypes, this.level, this.scope, ftv.generics, ftv.genericPacks);

    // A failed substitution keeps the clone as it is, as no error can be reported from here.
    result = this.reusableReplaceGenerics.substitute(result) ?? result;

    result.documentationSymbol = ty.documentationSymbol;
    return result;
  }

  cleanPack(tp: TypePackId): TypePackId {
    return tp;
  }
}

/**
 * Instantiates a type; only used under local type inference. A generic
 * function type comes back as a copy with its generics replaced by fresh free
 * types; any other type, and a function type without generics, comes back
 * as is.
 *
 * Higher-order generics are left alone: instantiating
 * <X>(<Y>(Y) -> (X, Y)) -> (X, Y) gives (<Y>(Y) -> ('x, Y)) -> ('x, Y),
 * which replaces the generic X with the free 'x and keeps the generic Y.
 *
 * Instantiation fails, returning undefined, only when the type exceeds the
 * internal recursion limits.
 */
export function instantiate(builtinTypes: BuiltinTypes, arena: TypeArena, limits: TypeCheckLimits, scope: Scope, ty: TypeId): TypeId | undefined {
  ty = follow(ty);

  const ft = get(ty, "FunctionType");
  if (!ft) return ty;

  if (ft.generics.length === 0 && ft.genericPacks.length === 0) return ty;

  const replacements = new Map<TypeId, TypeId>();
  const replacementPacks = new Map<TypePackId, TypePackId>();

  for (const g of ft.generics) {
    const gen = get(follow(g), "GenericType");
    if (gen) replacements.set(g, freshType(arena, builtinTypes, scope, gen.polarity));
  }

  for (const g of ft.genericPacks) {
    const gen = getPack(followPack(g), "GenericTypePack");
    if (gen) replacementPacks.set(g, arena.freshTypePack(scope, gen.polarity));
  }

  const r = new Replacer(arena, replacements, replacementPacks);

  if (limits.instantiationChildLimit !== undefined) r.childLimit = limits.instantiationChildLimit;

  // Persistent types are cloned too, so that generic builtins such as
  // `table.find` can be instantiated: otherwise the lines after would corrupt
  // the definition of the original function.
  const clonedFunctionTypeId = shallowClone(ty, arena, true);
  const ft2 = get(clonedFunctionTypeId, "FunctionType")!;

  ft2.generics = [];
  ft2.genericPacks = [];

  return r.substitute(clonedFunctionTypeId);
}
