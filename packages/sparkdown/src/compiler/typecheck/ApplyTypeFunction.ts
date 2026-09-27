// Applying a type alias to its arguments, ported from Luau's
// `ApplyTypeFunction.h`/`ApplyTypeFunction.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).

import { Substitution } from "./Substitution";
import { get, getPack, type TypeArena, type TypeId, type TypePackId } from "./Type";

/** A substitution that replaces the type parameters of a type alias (Luau's "type function") with its arguments. */
export class ApplyTypeFunction extends Substitution {
  /** Never set under the new solver. */
  encounteredForwardedType = false;
  typeArguments = new Map<TypeId, TypeId>();
  typePackArguments = new Map<TypePackId, TypePackId>();

  constructor(arena: TypeArena) {
    super(arena);
  }

  isDirty(ty: TypeId): boolean {
    if (this.typeArguments.has(ty)) return true;

    const ftv = get(ty, "FreeType");
    if (ftv) {
      if (ftv.forwardedTypeAlias) this.encounteredForwardedType = true;
      return false;
    } else return false;
  }

  isDirtyPack(tp: TypePackId): boolean {
    if (this.typePackArguments.has(tp)) return true;
    else return false;
  }

  override ignoreChildren(ty: TypeId): boolean {
    if (get(ty, "GenericType")) return true;
    else if (get(ty, "ExternType")) return true;
    else return false;
  }

  override ignoreChildrenPack(tp: TypePackId): boolean {
    if (getPack(tp, "GenericTypePack")) return true;
    else return false;
  }

  clean(ty: TypeId): TypeId {
    return this.typeArguments.get(ty)!;
  }

  cleanPack(tp: TypePackId): TypePackId {
    return this.typePackArguments.get(tp)!;
  }
}
