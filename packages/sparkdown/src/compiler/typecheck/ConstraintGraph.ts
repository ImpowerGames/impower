// The graph of dependencies between constraints, types and type packs, ported
// from Luau's `ConstraintGraph.h`/`.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`). A constraint with no outstanding dependencies can be
// dispatched, and a free type with none can be generalized.

import { Constraint, ReferenceCountInitializer } from "./Constraint";
import type { Scope } from "./Scope";
import { follow, followPack, get, getPack, Type, TypePackVar, type TypeId, type TypePackId } from "./Type";

export type ConstraintVertex = TypeId | TypePackId | Constraint;

/** An ordered set that remembers the order entries were first added in. */
class ConstraintList implements Iterable<ConstraintVertex> {
  private readonly present = new Map<ConstraintVertex, boolean>();
  private readonly order: ConstraintVertex[] = [];
  private entries = 0;

  contains(vertex: ConstraintVertex): boolean {
    return this.present.get(vertex) ?? false;
  }

  insert(vertex: ConstraintVertex): void {
    const entry = this.present.get(vertex);
    if (entry === undefined) {
      this.present.set(vertex, true);
      this.order.push(vertex);
      this.entries++;
    } else if (!entry) {
      this.present.set(vertex, true);
      this.entries++;
    }
  }

  remove(vertex: ConstraintVertex): void {
    const entry = this.present.get(vertex);
    if (entry === undefined) return;
    if (entry) this.entries--;
    this.present.set(vertex, false);
  }

  clear(): void {
    this.order.length = 0;
    this.present.clear();
    this.entries = 0;
  }

  get size(): number {
    return this.entries;
  }

  *[Symbol.iterator](): Iterator<ConstraintVertex> {
    for (let i = 0; i < this.order.length; i++) {
      const v = this.order[i]!;
      if (this.contains(v)) yield v;
    }
  }
}

export class ConstraintGraph {
  readonly constraints: Constraint[] = [];
  readonly freeTypes = new Set<TypeId>();
  readonly scopeToFunction = new Map<Scope, TypeId>();

  private readonly dependencies = new Map<ConstraintVertex, ConstraintList>();
  private readonly reverseDependencies = new Map<ConstraintVertex, ConstraintList>();

  /** Makes `dependency` block `target`; returns false when it already did. */
  addDependencyOf(dependency: ConstraintVertex, target: ConstraintVertex): boolean {
    const deps = this.findDependencyList(target);
    const reverseDeps = this.findReverseDependencyList(dependency);
    if (deps.contains(dependency)) return false;
    deps.insert(dependency);
    reverseDeps.insert(target);
    return true;
  }

  /** Makes everything that `existingVertex` blocks also blocked by `newVertex`. */
  inheritBlocks(existingVertex: ConstraintVertex, newVertex: ConstraintVertex): void {
    const existingReverseDeps = this.findReverseDependencyList(existingVertex);
    const newReverseDeps = this.findReverseDependencyList(newVertex);
    for (const rdep of [...existingReverseDeps]) {
      newReverseDeps.insert(rdep);
      this.findDependencyList(rdep).insert(newVertex);
    }
  }

  unblockType(vertex: TypeId): void {
    this.repairTypeReferences(vertex);
    this.clearReverseDependenciesOf(follow(vertex));
  }

  unblockTypePack(vertex: TypePackId): void {
    this.repairPackReferences(vertex);
    this.clearReverseDependenciesOf(followPack(vertex));
  }

  /**
   * Unblocks everything a dispatched constraint was blocking, repairs the
   * graph for any types the constraint bound, and returns the types and
   * packs it had blocked.
   */
  unblockConstraint(c: Constraint): { types: TypeId[]; packs: TypePackId[] } {
    const types: TypeId[] = [];
    const packs: TypePackId[] = [];
    const reverseDeps = this.findReverseDependencyList(c);
    for (const rdep of [...reverseDeps]) {
      if (rdep instanceof Type) {
        if (!types.includes(rdep)) types.push(rdep);
        this.findDependencyList(rdep).remove(c);
      } else if (rdep instanceof TypePackVar) {
        if (!packs.includes(rdep)) packs.push(rdep);
        this.findDependencyList(rdep).remove(c);
      } else {
        this.findDependencyList(rdep).remove(c);
      }
    }
    for (let type of types) {
      this.repairTypeReferences(type);
      // A free type's bounds may be mutated through it, as a call's return
      // pack is by a second call to the same function.
      type = follow(type);
      const ft = get(type, "FreeType");
      if (ft) {
        this.copyDependenciesOf(type, follow(ft.upperBound));
        this.copyDependenciesOf(type, follow(ft.lowerBound));
      }
    }
    for (const tp of packs) this.repairPackReferences(tp);
    return { types, packs };
  }

  hasUnsolvedDependencies(vertex: ConstraintVertex): boolean {
    return this.findDependencyList(vertex).size > 0;
  }

  private copyDependenciesToReachableTypes(
    originalVertex: ConstraintVertex | undefined,
    sourceDependencies: ConstraintList,
    mutatedTypes: Iterable<TypeId>,
    mutatedTypePacks: Iterable<TypePackId>,
  ): void {
    const types = [...mutatedTypes];
    const typePacks = [...mutatedTypePacks];
    for (const vertex of [...sourceDependencies]) {
      const vertexReverseDeps = this.findReverseDependencyList(vertex);
      if (originalVertex !== undefined) vertexReverseDeps.remove(originalVertex);
      for (const subTarget of types) {
        this.findDependencyList(subTarget).insert(vertex);
        vertexReverseDeps.insert(subTarget);
      }
      for (const subPackTarget of typePacks) {
        this.findDependencyList(subPackTarget).insert(vertex);
        vertexReverseDeps.insert(subPackTarget);
      }
    }
  }

  private clearReverseDependenciesOf(vertex: ConstraintVertex): void {
    const revDeps = this.findReverseDependencyList(vertex);
    for (const rdep of [...revDeps]) this.findDependencyList(rdep).remove(vertex);
    revDeps.clear();
  }

  shiftReferences(source: TypeId | TypePackId, target: TypeId | TypePackId): void {
    if (source === target) return;
    const sourceDependencies = this.findDependencyList(source);
    const rci = new ReferenceCountInitializer();
    if (target instanceof Type) rci.traverse(target);
    else rci.traversePack(target);
    this.copyDependenciesToReachableTypes(source, sourceDependencies, rci.mutatedTypes, rci.mutatedTypePacks);
    this.clearReverseDependenciesOf(source);
  }

  /** Makes the root of a chain of bound types the target of every reference to a type in the chain. */
  private repairTypeReferences(ty: TypeId): void {
    const root = follow(ty);
    const seen = new Set<TypeId>([root]);
    while (!seen.has(ty)) {
      seen.add(ty);
      this.shiftReferences(ty, root);
      const bt = get(ty, "BoundType");
      if (bt) ty = bt.boundTo;
    }
  }

  private repairPackReferences(tp: TypePackId): void {
    const root = followPack(tp);
    const seen = new Set<TypePackId>([root]);
    while (!seen.has(tp)) {
      seen.add(tp);
      this.shiftReferences(tp, root);
      const bt = getPack(tp, "BoundTypePack");
      if (bt) tp = bt.boundTo;
    }
  }

  /** Copies the dependencies of `source` to the mutable types reachable from `target`, keeping the source's. */
  copyDependenciesOf(source: TypeId | TypePackId, target: TypeId | TypePackId): void {
    const sourceDependencies = this.findDependencyList(source);
    const rci = new ReferenceCountInitializer();
    if (target instanceof Type) rci.traverse(target);
    else rci.traversePack(target);
    this.copyDependenciesToReachableTypes(undefined, sourceDependencies, rci.mutatedTypes, rci.mutatedTypePacks);
  }

  private findDependencyList(vertex: ConstraintVertex): ConstraintList {
    let list = this.dependencies.get(vertex);
    if (!list) this.dependencies.set(vertex, (list = new ConstraintList()));
    return list;
  }

  private findReverseDependencyList(vertex: ConstraintVertex): ConstraintList {
    let list = this.reverseDependencies.get(vertex);
    if (!list) this.reverseDependencies.set(vertex, (list = new ConstraintList()));
    return list;
  }
}
