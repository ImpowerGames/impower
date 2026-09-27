// A breadth-first walk over a type, ported from Luau's
// `IterativeTypeVisitor.h`/`.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).
//
// Unlike `GenericTypeVisitor`, this visitor keeps a work queue instead of
// recursing, so `traverse` only queues a type: its children are visited after
// every type queued before them. A type met again on the path from the root
// reaches `cycle`. By default each type is visited once.

import { follow, get, type TypeId, type TypePackId, type TypePackVar, type TypePackVariant, type TypeVariant } from "./Type";

interface WorkItem {
  t: TypeId | TypePackId;
  isType: boolean;
  /** The index of the item that queued this one, or -1. */
  parent: number;
}

export abstract class IterativeTypeVisitor {
  private readonly seen: Set<object>;
  private workQueue: WorkItem[] = [];
  private parentCursor = -1;
  private workCursor = 0;

  constructor(
    readonly visitorName: string,
    readonly skipBoundTypes: boolean,
    readonly visitOnce = true,
    seen: Set<object> = new Set(),
  ) {
    this.seen = seen;
  }

  cycle(_ty: TypeId): void {}
  cyclePack(_tp: TypePackId): void {}

  visit(_ty: TypeId): boolean {
    return true;
  }

  visitPack(_tp: TypePackId): boolean {
    return true;
  }

  /** Called with each type's variant; the default defers to `visit`. */
  visitType(ty: TypeId, _variant: TypeVariant): boolean {
    return this.visit(ty);
  }

  /** Called with each type pack's variant; the default defers to `visitPack`. */
  visitTypePack(tp: TypePackId, _variant: TypePackVariant): boolean {
    return this.visitPack(tp);
  }

  run(rootTy: TypeId): void {
    this.parentCursor = -1;
    this.workCursor = 0;
    this.workQueue = [];
    this.traverse(rootTy);
    this.processWorkQueue();
  }

  runPack(rootTp: TypePackId): void {
    this.parentCursor = -1;
    this.workCursor = 0;
    this.workQueue = [];
    this.traversePack(rootTp);
    this.processWorkQueue();
  }

  /** Queues a type; it is not processed immediately. */
  protected traverse(ty: TypeId): void {
    this.workQueue.push({ t: ty, isType: true, parent: this.parentCursor });
  }

  /** Queues a type pack; it is not processed immediately. */
  protected traversePack(tp: TypePackId): void {
    this.workQueue.push({ t: tp, isType: false, parent: this.parentCursor });
  }

  private process(ty: TypeId): void {
    // With `skipBoundTypes`, a bound type stands for the type it is bound
    // to, whatever the entry point into a cyclic type was.
    if (this.skipBoundTypes) {
      if (get(ty, "BoundType")) ty = follow(ty);
      else {
        const tt = get(ty, "TableType");
        if (tt && tt.boundTo) ty = follow(ty);
      }
    }
    if (this.hasSeen(ty)) return;
    const v = ty.ty;
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
        // Some visitors want to see bound tables, so the original type is traversed.
        if (this.skipBoundTypes && v.boundTo) {
          this.traverse(v.boundTo);
        } else if (this.visitType(ty, v)) {
          if (v.boundTo) {
            this.traverse(v.boundTo);
          } else {
            for (const [, prop] of v.props) {
              if (prop.readTy) this.traverse(prop.readTy);
              // A property whose read and write types are one type is traversed once.
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
          let unionChanged = false;
          for (const optTy of v.options) {
            this.traverse(optTy);
            if (!get(follow(ty), "UnionType")) {
              unionChanged = true;
              break;
            }
          }
          if (unionChanged) this.traverse(ty);
        }
        break;
      case "IntersectionType":
        if (this.visitType(ty, v)) {
          let intersectionChanged = false;
          for (const partTy of v.parts) {
            this.traverse(partTy);
            if (!get(follow(ty), "IntersectionType")) {
              intersectionChanged = true;
              break;
            }
          }
          if (intersectionChanged) this.traverse(ty);
        }
        break;
      case "LazyType":
        // An unwrapped lazy type is not expanded, which could go on forever.
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
    this.unsee(ty);
  }

  private processPack(tp: TypePackId): void {
    if (this.hasSeen(tp)) return;
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

  private hasSeen(tv: object): boolean {
    if (!this.visitOnce) return false;
    if (this.seen.has(tv)) return true;
    this.seen.add(tv);
    return false;
  }

  private unsee(tv: object): void {
    if (!this.visitOnce) this.seen.delete(tv);
  }

  /** Whether the current item appears among its own ancestors. */
  private isCyclic(t: TypeId | TypePackId, isType: boolean): boolean {
    let item = this.workQueue[this.workCursor]!;
    while (item.parent >= 0) {
      item = this.workQueue[item.parent]!;
      if (item.isType === isType && item.t === t) return true;
    }
    return false;
  }

  private processWorkQueue(): void {
    while (this.workCursor < this.workQueue.length) {
      const item = this.workQueue[this.workCursor]!;
      this.parentCursor = this.workCursor;
      if (item.isType) {
        const ty = item.t as TypeId;
        if (this.isCyclic(ty, true)) this.cycle(ty);
        else this.process(ty);
      } else {
        const tp = item.t as TypePackVar;
        if (this.isCyclic(tp, false)) this.cyclePack(tp);
        else this.processPack(tp);
      }
      ++this.workCursor;
    }
  }
}
