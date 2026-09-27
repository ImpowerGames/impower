// Walking the types under a type, ported from Luau's `VisitType.h`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).
//
// A visitor overrides `visitType` and `visitTypePack`, which receive each
// type with its variant; returning true descends into the type's parts. The
// defaults defer to `visit` and `visitPack`, as Luau's per-kind overloads
// defer to `visit(TypeId)`. A cycle reaches `cycle` instead of recursing.

import { follow, get, type TypeId, type TypePackId, type TypePackVariant, type TypeVariant } from "./Type";

const VISIT_RECURSION_LIMIT = 500;

export class RecursionLimitError extends Error {
  constructor(what: string) {
    super(`Exceeded the recursion limit in ${what}`);
    this.name = "RecursionLimitError";
  }
}

export abstract class GenericTypeVisitor {
  protected readonly seen = new Set<object>();
  private recursionCounter = 0;

  /**
   * @param once visit each type once, even when several paths reach it
   *   (Luau's `TypeOnceVisitor`); otherwise a type is visited on every path
   *   but not within its own subtree (`TypeVisitor`).
   */
  constructor(
    readonly visitorName: string,
    readonly skipBoundTypes: boolean,
    readonly once: boolean,
  ) {}

  cycle(_ty: TypeId): void {}
  cyclePack(_tp: TypePackId): void {}

  visit(_ty: TypeId): boolean {
    return true;
  }

  visitPack(_tp: TypePackId): boolean {
    return true;
  }

  visitType(ty: TypeId, _variant: TypeVariant): boolean {
    return this.visit(ty);
  }

  visitTypePack(tp: TypePackId, _variant: TypePackVariant): boolean {
    return this.visitPack(tp);
  }

  private hasSeen(o: object): boolean {
    if (this.seen.has(o)) return true;
    this.seen.add(o);
    return false;
  }

  private unsee(o: object): void {
    if (!this.once) this.seen.delete(o);
  }

  traverse(ty: TypeId): void {
    if (this.skipBoundTypes && get(ty, "BoundType")) ty = follow(ty);
    if (++this.recursionCounter > VISIT_RECURSION_LIMIT) {
      this.recursionCounter--;
      throw new RecursionLimitError(this.visitorName);
    }
    try {
      if (this.hasSeen(ty)) {
        this.cycle(ty);
        return;
      }
      this.traverseVariant(ty, ty.ty);
      this.unsee(ty);
    } finally {
      this.recursionCounter--;
    }
  }

  private traverseVariant(ty: TypeId, v: TypeVariant): void {
    switch (v.kind) {
      case "BoundType":
        if (this.visitType(ty, v)) this.traverse(v.boundTo);
        break;
      case "FreeType":
        if (this.visitType(ty, v)) {
          this.traverse(v.lowerBound);
          this.traverse(v.upperBound);
          if (v.primitiveType) this.traverse(v.primitiveType);
        }
        break;
      case "FunctionType":
        if (this.visitType(ty, v)) {
          this.traversePack(v.argTypes);
          this.traversePack(v.retTypes);
        }
        break;
      case "TableType":
        if (this.skipBoundTypes && v.boundTo) {
          this.traverse(v.boundTo);
        } else if (this.visitType(ty, v)) {
          if (v.boundTo) {
            this.traverse(v.boundTo);
          } else {
            for (const [, prop] of v.props) {
              if (prop.readTy) this.traverse(prop.readTy);
              if (prop.writeTy && !prop.isShared()) this.traverse(prop.writeTy);
            }
            if (v.indexer) {
              this.traverse(v.indexer.indexType);
              this.traverse(v.indexer.indexResultType);
            }
          }
        }
        break;
      case "MetatableType":
        if (this.visitType(ty, v)) {
          this.traverse(v.table);
          this.traverse(v.metatable);
        }
        break;
      case "ExternType":
        if (this.visitType(ty, v)) {
          for (const [, prop] of v.props) {
            if (prop.readTy) this.traverse(prop.readTy);
            if (prop.writeTy && !prop.isShared()) this.traverse(prop.writeTy);
          }
          if (v.parent) this.traverse(v.parent);
          if (v.metatable) this.traverse(v.metatable);
          if (v.indexer) {
            this.traverse(v.indexer.indexType);
            this.traverse(v.indexer.indexResultType);
          }
        }
        break;
      case "UnionType":
        if (this.visitType(ty, v)) {
          let changed = false;
          for (const opt of v.options) {
            this.traverse(opt);
            if (!get(follow(ty), "UnionType")) {
              changed = true;
              break;
            }
          }
          if (changed) this.traverse(ty);
        }
        break;
      case "IntersectionType":
        if (this.visitType(ty, v)) {
          let changed = false;
          for (const part of v.parts) {
            this.traverse(part);
            if (!get(follow(ty), "IntersectionType")) {
              changed = true;
              break;
            }
          }
          if (changed) this.traverse(ty);
        }
        break;
      case "LazyType":
        if (v.unwrapped) this.traverse(v.unwrapped);
        break;
      case "PendingExpansionType":
        if (this.visitType(ty, v)) {
          for (const a of v.typeArguments) this.traverse(a);
          for (const a of v.packArguments) this.traversePack(a);
        }
        break;
      case "NegationType":
        if (this.visitType(ty, v)) this.traverse(v.ty);
        break;
      case "TypeFunctionInstanceType":
        if (this.visitType(ty, v)) {
          for (const p of v.typeArguments) this.traverse(p);
          for (const p of v.packArguments) this.traversePack(p);
        }
        break;
      default:
        this.visitType(ty, v);
        break;
    }
  }

  traversePack(tp: TypePackId): void {
    if (this.hasSeen(tp)) {
      this.cyclePack(tp);
      return;
    }
    const v = tp.ty;
    switch (v.kind) {
      case "BoundTypePack":
        if (this.visitTypePack(tp, v)) this.traversePack(v.boundTo);
        break;
      case "TypePack":
        if (this.visitTypePack(tp, v)) {
          for (const ty of v.head) this.traverse(ty);
          if (v.tail) this.traversePack(v.tail);
        }
        break;
      case "VariadicTypePack":
        if (this.visitTypePack(tp, v)) this.traverse(v.ty);
        break;
      case "TypeFunctionInstanceTypePack":
        if (this.visitTypePack(tp, v)) {
          for (const t of v.typeArguments) this.traverse(t);
          for (const t of v.packArguments) this.traversePack(t);
        }
        break;
      default:
        this.visitTypePack(tp, v);
        break;
    }
    this.unsee(tp);
  }
}

/** Visits each type on every path to it, skipping cycles (Luau's `TypeVisitor`). */
export abstract class TypeVisitor extends GenericTypeVisitor {
  constructor(visitorName: string, skipBoundTypes: boolean) {
    super(visitorName, skipBoundTypes, false);
  }
}

/** Visits each type once (Luau's `TypeOnceVisitor`). */
export abstract class TypeOnceVisitor extends GenericTypeVisitor {
  constructor(visitorName: string, skipBoundTypes: boolean) {
    super(visitorName, skipBoundTypes, true);
  }
}
