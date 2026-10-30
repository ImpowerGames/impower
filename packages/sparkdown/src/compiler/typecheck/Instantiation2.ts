// Replacing the generics of a function type with the types inferred for them,
// ported from Luau's `Instantiation2.h`/`Instantiation2.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).

import type { Scope } from "./Scope";
import { Substitution } from "./Substitution";
import type { Subtyping } from "./Subtyping";
import { flatten, follow, followPack, get, getPack, is, type FreeType, type TypeArena, type TypeId, type TypePackId } from "./Type";

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

      for (const generic of ftv.generics) if (this.replacements.has(generic)) return true;

      for (const generic of ftv.genericPacks) if (this.replacementPacks.has(generic)) return true;
    }

    return false;
  }
}

export function resolveGenericSubstitutions(
  arena: TypeArena,
  genericSubstitutions: Map<TypeId, TypeId>,
  genericPackSubstitutions: Map<TypePackId, TypePackId>,
  subtyping: Subtyping,
  scope: Scope,
): void {
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
