// Replacing the generics of a function type with the types inferred for them,
// ported from Luau's `Instantiation2.h`/`Instantiation2.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).
//
// When a generic function is called, unification maps each of its generics to
// a free type. `instantiate2` resolves each of those free types to one of its
// bounds and substitutes the results for the generics.

import type { Scope } from "./Scope";
import { Substitution } from "./Substitution";
import type { Subtyping } from "./Subtyping";
import { flatten, follow, followPack, get, getPack, is, type FreeType, type TypeArena, type TypeId, type TypePackId } from "./Type";

/**
 * A substitution that replaces each type and pack that is a key of its maps
 * with the mapped value. The maps belong to the caller, who may keep changing
 * them. A key must not be a bound type: the substitution only meets followed
 * types, so a bound key never matches.
 */
export class Replacer extends Substitution {
  constructor(
    arena: TypeArena,
    readonly replacements: Map<TypeId, TypeId>,
    readonly replacementPacks: Map<TypePackId, TypePackId>,
  ) {
    super(arena);
  }

  isDirty(ty: TypeId): boolean {
    return this.replacements.has(ty);
  }

  isDirtyPack(tp: TypePackId): boolean {
    return this.replacementPacks.has(tp);
  }

  clean(ty: TypeId): TypeId {
    const res = this.replacements.get(ty)!;
    this.dontTraverseInto(res);
    return res;
  }

  cleanPack(tp: TypePackId): TypePackId {
    const res = this.replacementPacks.get(tp)!;
    this.dontTraverseIntoPack(res);
    return res;
  }

  override ignoreChildren(ty: TypeId): boolean {
    if (get(ty, "ExternType")) return true;

    const ftv = get(ty, "FunctionType");
    if (ftv) {
      if (ftv.hasNoFreeOrGenericTypes) return false;

      // A function type that quantifies over these generics shadows them, so
      // the substitution goes no further into it.
      for (const generic of ftv.generics) if (this.replacements.has(generic)) return true;

      for (const generic of ftv.genericPacks) if (this.replacementPacks.has(generic)) return true;
    }

    return false;
  }
}

/**
 * Replaces each free type the substitutions map a generic to with the bound
 * that best describes it, in the maps themselves: the free types stay as they
 * are, as other parts of the solver may still refer to them. A pack
 * substitution that holds one of those free types is replaced by a new pack,
 * so that other references to the old pack are not affected.
 */
export function resolveGenericSubstitutions(
  arena: TypeArena,
  genericSubstitutions: Map<TypeId, TypeId>,
  genericPackSubstitutions: Map<TypePackId, TypePackId>,
  subtyping: Subtyping,
  scope: Scope,
): void {
  // The free types the type substitutions map to, collected before the map's
  // values are overwritten: these may also appear inside the pack
  // substitutions, and are resolved there too.
  const originalFreeTypes = new Set<TypeId>();
  for (const v of genericSubstitutions.values()) {
    const followed = follow(v);
    if (get(followed, "FreeType")) originalFreeTypes.add(followed);
  }

  const pickBound = (ft: FreeType): TypeId => {
    if (is(follow(ft.lowerBound), "NeverType")) return ft.upperBound;
    else if (is(follow(ft.upperBound), "UnknownType")) return ft.lowerBound;
    else {
      const r = subtyping.isSubtype(ft.lowerBound, ft.upperBound, scope);
      return r.isSubtype ? ft.lowerBound : ft.upperBound;
    }
  };

  for (const [generic, substitution] of genericSubstitutions) {
    let ty = follow(substitution);
    const ft = get(ty, "FreeType");
    if (ft) ty = pickBound(ft);
    genericSubstitutions.set(generic, ty);
  }

  for (const [genericPack, packSubst] of genericPackSubstitutions) {
    const followed = followPack(packSubst);
    const pack = getPack(followed, "TypePack");
    if (pack) {
      let changed = false;
      const newHead: TypeId[] = [];
      const { head, tail } = flatten(followed);

      for (const element of head) {
        const ty = follow(element);
        const ft = get(ty, "FreeType");
        if (ft && originalFreeTypes.has(ty)) {
          newHead.push(pickBound(ft));
          changed = true;
        } else newHead.push(ty);
      }

      if (changed) genericPackSubstitutions.set(genericPack, arena.addTypePack(newHead, tail));
    }
  }
}

/**
 * Substitutes the types inferred for the generics of a function type (Luau
 * notes that this is not really instantiation). The maps are copied first,
 * as Luau takes them by value, so resolving the substitutions leaves the
 * caller's maps as they were. Undefined when the type is too large to
 * substitute.
 */
export function instantiate2(
  arena: TypeArena,
  genericSubstitutions: Map<TypeId, TypeId>,
  genericPackSubstitutions: Map<TypePackId, TypePackId>,
  subtyping: Subtyping,
  scope: Scope,
  ty: TypeId,
): TypeId | undefined {
  const typeSubstitutions = new Map(genericSubstitutions);
  const packSubstitutions = new Map(genericPackSubstitutions);
  resolveGenericSubstitutions(arena, typeSubstitutions, packSubstitutions, subtyping, scope);
  const r = new Replacer(arena, typeSubstitutions, packSubstitutions);
  return r.substitute(ty);
}

export function instantiate2Pack(
  arena: TypeArena,
  genericSubstitutions: Map<TypeId, TypeId>,
  genericPackSubstitutions: Map<TypePackId, TypePackId>,
  subtyping: Subtyping,
  scope: Scope,
  tp: TypePackId,
): TypePackId | undefined {
  const typeSubstitutions = new Map(genericSubstitutions);
  const packSubstitutions = new Map(genericPackSubstitutions);
  resolveGenericSubstitutions(arena, typeSubstitutions, packSubstitutions, subtyping, scope);
  const r = new Replacer(arena, typeSubstitutions, packSubstitutions);
  return r.substitutePack(tp);
}
