// An ordered set of types, ported from Luau's `TypeIds.h`/`TypeIds.cpp`;
// Luau is MIT-licensed (see `LICENSE-luau.txt`). Types are followed on the
// way in, and iteration is in insertion order.

import { follow, get, type TypeId } from "./Type";

export class TypeIds implements Iterable<TypeId> {
  private readonly present = new Set<TypeId>();
  private order: TypeId[] = [];

  constructor(tys?: Iterable<TypeId>) {
    if (tys) for (const ty of tys) this.insert(ty);
  }

  insert(ty: TypeId): void {
    ty = follow(ty);
    if (this.present.has(ty)) return;
    this.present.add(ty);
    this.order.push(ty);
  }

  insertAll(tys: Iterable<TypeId>): void {
    for (const ty of tys) this.insert(ty);
  }

  /** Keeps only the types that are also in `tys`. */
  retain(tys: TypeIds): void {
    this.order = this.order.filter((ty) => {
      if (tys.contains(ty)) return true;
      this.present.delete(ty);
      return false;
    });
  }

  clear(): void {
    this.present.clear();
    this.order = [];
  }

  front(): TypeId {
    const t = this.order[0];
    if (!t) throw new Error("TypeIds.front on an empty set");
    return t;
  }

  erase(ty: TypeId): void {
    if (!this.present.delete(ty)) return;
    this.order = this.order.filter((t) => t !== ty);
  }

  get size(): number {
    return this.order.length;
  }

  empty(): boolean {
    return this.order.length === 0;
  }

  contains(ty: TypeId): boolean {
    return this.present.has(follow(ty));
  }

  count(ty: TypeId): number {
    return this.contains(ty) ? 1 : 0;
  }

  /** Whether every type in the set is never; true for an empty set. */
  isNever(): boolean {
    return this.order.every((t) => get(t, "NeverType") !== undefined);
  }

  equals(there: TypeIds): boolean {
    if (this.order.length !== there.order.length) return false;
    return this.order.every((ty) => there.contains(ty));
  }

  /** A key equal for equal sets, whatever their order. */
  key(): string {
    return this.order
      .map((t) => t.serial)
      .sort((a, b) => a - b)
      .join(",");
  }

  toArray(): TypeId[] {
    return this.order.slice();
  }

  take(): TypeId[] {
    const result = this.order;
    this.order = [];
    this.present.clear();
    return result;
  }

  clone(): TypeIds {
    const t = new TypeIds();
    for (const ty of this.order) {
      t.present.add(ty);
      t.order.push(ty);
    }
    return t;
  }

  [Symbol.iterator](): Iterator<TypeId> {
    return this.order.slice()[Symbol.iterator]();
  }
}
