// Substituting types within a type graph, ported from Luau's
// `Substitution.h`/`Substitution.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).
//
// A substitution walks the strongly connected components of a type graph
// (Tarjan's algorithm) to find every type that is dirty or reaches a dirty
// type, replaces dirty types with `clean` and copies the ones that only reach
// them, then points the copies' children at the replacements.

import { copyPackVariant } from "./Clone";
import {
  followPack,
  follow,
  TableIndexer,
  type TypeArena,
  type TypeId,
  type TypePackId,
  type TypeVariant,
} from "./Type";

// Luau's `LuauTarjanChildLimit`.
const TARJAN_CHILD_LIMIT = 10000;

export const enum TarjanResult {
  TooManyChildren,
  Ok,
}

interface TarjanNode {
  ty: TypeId | undefined;
  tp: TypePackId | undefined;
  onStack: boolean;
  dirty: boolean;
  lowlink: number;
}

interface WorklistVertex {
  index: number;
  currEdge: number;
  lastEdge: number;
}

export abstract class Tarjan {
  private typeToIndex = new Map<TypeId, number>();
  private packToIndex = new Map<TypePackId, number>();
  private nodes: TarjanNode[] = [];
  private stack: number[] = [];
  private childCount = 0;
  childLimit = 0;
  private edgesTy: (TypeId | undefined)[] = [];
  private edgesTp: (TypePackId | undefined)[] = [];
  private worklist: WorklistVertex[] = [];

  abstract isDirty(ty: TypeId): boolean;
  abstract isDirtyPack(tp: TypePackId): boolean;
  abstract foundDirty(ty: TypeId): void;
  abstract foundDirtyPack(tp: TypePackId): void;

  ignoreChildren(_ty: TypeId): boolean {
    return false;
  }

  ignoreChildrenPack(_tp: TypePackId): boolean {
    return false;
  }

  ignoreChildrenVisit(ty: TypeId): boolean {
    return this.ignoreChildren(ty);
  }

  ignoreChildrenVisitPack(tp: TypePackId): boolean {
    return this.ignoreChildrenPack(tp);
  }

  private visitChild(ty: TypeId | undefined): void {
    if (!ty) return;
    this.edgesTy.push(follow(ty));
    this.edgesTp.push(undefined);
  }

  private visitChildPack(tp: TypePackId | undefined): void {
    if (!tp) return;
    this.edgesTy.push(undefined);
    this.edgesTp.push(followPack(tp));
  }

  private visitChildren(ty: TypeId): void {
    if (this.ignoreChildrenVisit(ty)) return;
    const v = ty.ty;
    switch (v.kind) {
      case "FunctionType":
        for (const g of v.generics) this.visitChild(g);
        for (const g of v.genericPacks) this.visitChildPack(g);
        this.visitChildPack(v.argTypes);
        this.visitChildPack(v.retTypes);
        break;
      case "TableType":
        for (const [, prop] of v.props) {
          this.visitChild(prop.readTy);
          this.visitChild(prop.writeTy);
        }
        if (v.indexer) {
          this.visitChild(v.indexer.indexType);
          this.visitChild(v.indexer.indexResultType);
        }
        for (const itp of v.instantiatedTypeParams) this.visitChild(itp);
        for (const itp of v.instantiatedTypePackParams) this.visitChildPack(itp);
        break;
      case "MetatableType":
        this.visitChild(v.table);
        this.visitChild(v.metatable);
        break;
      case "UnionType":
        for (const opt of v.options) this.visitChild(opt);
        break;
      case "IntersectionType":
        for (const part of v.parts) this.visitChild(part);
        break;
      case "PendingExpansionType":
      case "TypeFunctionInstanceType":
        for (const a of v.typeArguments) this.visitChild(a);
        for (const a of v.packArguments) this.visitChildPack(a);
        break;
      case "ExternType":
        for (const [, prop] of v.props) {
          this.visitChild(prop.readTy);
          this.visitChild(prop.writeTy);
        }
        this.visitChild(v.parent);
        this.visitChild(v.metatable);
        if (v.indexer) {
          this.visitChild(v.indexer.indexType);
          this.visitChild(v.indexer.indexResultType);
        }
        break;
      case "NegationType":
        this.visitChild(v.ty);
        break;
      default:
        break;
    }
  }

  private visitChildrenPack(tp: TypePackId): void {
    if (this.ignoreChildrenVisitPack(tp)) return;
    const v = tp.ty;
    if (v.kind === "TypePack") {
      for (const t of v.head) this.visitChild(t);
      this.visitChildPack(v.tail);
    } else if (v.kind === "VariadicTypePack") {
      this.visitChild(v.ty);
    }
  }

  private indexify(ty: TypeId): [number, boolean] {
    ty = follow(ty);
    const existing = this.typeToIndex.get(ty);
    if (existing !== undefined) return [existing, false];
    const index = this.nodes.length;
    this.typeToIndex.set(ty, index);
    this.nodes.push({ ty, tp: undefined, onStack: false, dirty: false, lowlink: index });
    return [index, true];
  }

  private indexifyPack(tp: TypePackId): [number, boolean] {
    tp = followPack(tp);
    const existing = this.packToIndex.get(tp);
    if (existing !== undefined) return [existing, false];
    const index = this.nodes.length;
    this.packToIndex.set(tp, index);
    this.nodes.push({ ty: undefined, tp, onStack: false, dirty: false, lowlink: index });
    return [index, true];
  }

  private loop(): TarjanResult {
    while (this.worklist.length) {
      const top = this.worklist[this.worklist.length - 1]!;
      const index = top.index;
      let currEdge = top.currEdge;
      let lastEdge = top.lastEdge;
      if (currEdge === -1) {
        ++this.childCount;
        if (this.childLimit > 0 && this.childLimit <= this.childCount) return TarjanResult.TooManyChildren;
        this.stack.push(index);
        this.nodes[index]!.onStack = true;
        currEdge = this.edgesTy.length;
        const node = this.nodes[index]!;
        if (node.ty) this.visitChildren(node.ty);
        else if (node.tp) this.visitChildrenPack(node.tp);
        lastEdge = this.edgesTy.length;
      }
      let foundFresh = false;
      for (; currEdge < lastEdge; currEdge++) {
        let childIndex = -1;
        let fresh = false;
        const ty = this.edgesTy[currEdge];
        const tp = this.edgesTp[currEdge];
        if (ty) [childIndex, fresh] = this.indexify(ty);
        else if (tp) [childIndex, fresh] = this.indexifyPack(tp);
        if (fresh) {
          this.worklist[this.worklist.length - 1] = { index, currEdge: currEdge + 1, lastEdge };
          this.worklist.push({ index: childIndex, currEdge: -1, lastEdge: -1 });
          foundFresh = true;
          break;
        } else if (this.nodes[childIndex]!.onStack) {
          this.nodes[index]!.lowlink = Math.min(this.nodes[index]!.lowlink, childIndex);
        }
        this.visitEdge(childIndex, index);
      }
      if (foundFresh) continue;
      if (this.nodes[index]!.lowlink === index) {
        this.visitSCC(index);
        while (this.stack.length) {
          const popped = this.stack.pop()!;
          this.nodes[popped]!.onStack = false;
          if (popped === index) break;
        }
      }
      this.worklist.pop();
      if (this.worklist.length) {
        const parent = this.worklist[this.worklist.length - 1]!;
        this.edgesTy.length = parent.lastEdge;
        this.edgesTp.length = parent.lastEdge;
        this.nodes[parent.index]!.lowlink = Math.min(this.nodes[parent.index]!.lowlink, this.nodes[index]!.lowlink);
        this.visitEdge(index, parent.index);
      }
    }
    return TarjanResult.Ok;
  }

  private visitRoot(ty: TypeId): TarjanResult {
    this.childCount = 0;
    if (this.childLimit === 0) this.childLimit = TARJAN_CHILD_LIMIT;
    const [index] = this.indexify(follow(ty));
    this.worklist.push({ index, currEdge: -1, lastEdge: -1 });
    return this.loop();
  }

  private visitRootPack(tp: TypePackId): TarjanResult {
    this.childCount = 0;
    if (this.childLimit === 0) this.childLimit = TARJAN_CHILD_LIMIT;
    const [index] = this.indexifyPack(followPack(tp));
    this.worklist.push({ index, currEdge: -1, lastEdge: -1 });
    return this.loop();
  }

  protected clearTarjan(): void {
    this.typeToIndex = new Map();
    this.packToIndex = new Map();
    this.nodes = [];
    this.stack = [];
    this.childCount = 0;
    this.edgesTy = [];
    this.edgesTp = [];
    this.worklist = [];
  }

  private visitEdge(index: number, parentIndex: number): void {
    if (this.nodes[index]!.dirty) this.nodes[parentIndex]!.dirty = true;
  }

  private visitSCC(index: number): void {
    let d = this.nodes[index]!.dirty;
    for (let i = this.stack.length - 1; !d && i >= 0; i--) {
      const at = this.stack[i]!;
      const node = this.nodes[at]!;
      if (node.ty) d = this.isDirty(node.ty);
      else if (node.tp) d = this.isDirtyPack(node.tp);
      if (at === index) break;
    }
    if (!d) return;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const at = this.stack[i]!;
      this.nodes[at]!.dirty = true;
      const node = this.nodes[at]!;
      if (node.ty) this.foundDirty(node.ty);
      else if (node.tp) this.foundDirtyPack(node.tp);
      if (at === index) return;
    }
  }

  findDirty(ty: TypeId): TarjanResult {
    return this.visitRoot(ty);
  }

  findDirtyPack(tp: TypePackId): TarjanResult {
    return this.visitRootPack(tp);
  }
}

/** A copy of a type's contents for substitution, as Substitution.cpp's `shallowClone`. */
function substitutionClone(ty: TypeId, dest: TypeArena): TypeId {
  ty = follow(ty);
  const v = ty.ty;
  let copy: TypeVariant | undefined;
  switch (v.kind) {
    case "FreeType":
    case "PrimitiveType":
    case "AnyType":
    case "NoRefineType":
    case "UnknownType":
    case "NeverType":
    case "LazyType":
      return ty;
    case "ErrorType":
      if (ty.persistent) return ty;
      copy = { ...v };
      break;
    case "FunctionType":
      copy = {
        ...v,
        generics: [...v.generics],
        genericPacks: [...v.genericPacks],
        tags: [...v.tags],
        argNames: [...v.argNames],
        hasNoFreeOrGenericTypes: false,
      };
      break;
    case "TableType":
      copy = {
        ...v,
        props: v.props.clone(),
        indexer: v.indexer ? new TableIndexer(v.indexer.indexType, v.indexer.indexResultType, v.indexer.isReadOnly) : undefined,
        instantiatedTypeParams: [...v.instantiatedTypeParams],
        instantiatedTypePackParams: [...v.instantiatedTypePackParams],
        tags: [...v.tags],
        boundTo: undefined,
        remainingProps: 0,
      };
      break;
    case "ExternType":
      copy = { ...v, props: v.props.clone(), tags: [...v.tags] };
      break;
    case "UnionType":
      copy = { ...v, options: [...v.options] };
      break;
    case "IntersectionType":
      copy = { ...v, parts: [...v.parts] };
      break;
    case "PendingExpansionType":
    case "TypeFunctionInstanceType":
      copy = { ...v, typeArguments: [...v.typeArguments], packArguments: [...v.packArguments] };
      break;
    case "SingletonType":
      copy = { ...v, variant: { ...v.variant } };
      break;
    default:
      copy = { ...v };
      break;
  }
  const resTy = dest.addType(copy);
  resTy.documentationSymbol = ty.documentationSymbol;
  return resTy;
}

export abstract class Substitution extends Tarjan {
  newTypes = new Map<TypeId, TypeId>();
  newPacks = new Map<TypePackId, TypePackId>();
  replacedTypes = new Set<TypeId>();
  replacedTypePacks = new Set<TypePackId>();
  noTraverseTypes = new Set<TypeId>();
  noTraverseTypePacks = new Set<TypePackId>();

  constructor(public arena: TypeArena) {
    super();
  }

  abstract clean(ty: TypeId): TypeId;
  abstract cleanPack(tp: TypePackId): TypePackId;

  /** Prevents substitution inside a type that `clean` returned and that must not be mutated. */
  protected dontTraverseInto(ty: TypeId): void {
    this.noTraverseTypes.add(ty);
  }

  protected dontTraverseIntoPack(tp: TypePackId): void {
    this.noTraverseTypePacks.add(tp);
  }

  private replaceAll(): void {
    for (const [oldTy, newTy] of this.newTypes) {
      if (!this.ignoreChildren(oldTy) && !this.replacedTypes.has(newTy)) {
        if (!this.noTraverseTypes.has(newTy)) this.replaceChildren(newTy);
        this.replacedTypes.add(newTy);
      }
    }
    for (const [oldTp, newTp] of this.newPacks) {
      if (!this.ignoreChildrenPack(oldTp) && !this.replacedTypePacks.has(newTp)) {
        if (!this.noTraverseTypePacks.has(newTp)) this.replaceChildrenPack(newTp);
        this.replacedTypePacks.add(newTp);
      }
    }
  }

  substitute(ty: TypeId): TypeId | undefined {
    ty = follow(ty);
    this.clearTarjan();
    if (this.findDirty(ty) !== TarjanResult.Ok) return undefined;
    this.replaceAll();
    return this.replace(ty);
  }

  substitutePack(tp: TypePackId): TypePackId | undefined {
    tp = followPack(tp);
    this.clearTarjan();
    if (this.findDirtyPack(tp) !== TarjanResult.Ok) return undefined;
    this.replaceAll();
    return this.replacePack(tp);
  }

  resetState(arena: TypeArena): void {
    this.clearTarjan();
    this.arena = arena;
    this.newTypes = new Map();
    this.newPacks = new Map();
    this.replacedTypes = new Set();
    this.replacedTypePacks = new Set();
    this.noTraverseTypes = new Set();
    this.noTraverseTypePacks = new Set();
  }

  clone(ty: TypeId): TypeId {
    return substitutionClone(ty, this.arena);
  }

  clonePack(tp: TypePackId): TypePackId {
    tp = followPack(tp);
    return this.arena.addTypePack(copyPackVariant(tp.ty));
  }

  foundDirty(ty: TypeId): void {
    ty = follow(ty);
    if (this.newTypes.has(ty)) return;
    this.newTypes.set(ty, follow(this.isDirty(ty) ? this.clean(ty) : this.clone(ty)));
  }

  foundDirtyPack(tp: TypePackId): void {
    tp = followPack(tp);
    if (this.newPacks.has(tp)) return;
    this.newPacks.set(tp, followPack(this.isDirtyPack(tp) ? this.cleanPack(tp) : this.clonePack(tp)));
  }

  replace(ty: TypeId): TypeId {
    ty = follow(ty);
    return this.newTypes.get(ty) ?? ty;
  }

  replacePack(tp: TypePackId): TypePackId {
    tp = followPack(tp);
    return this.newPacks.get(tp) ?? tp;
  }

  replaceChildren(ty: TypeId): void {
    if (this.ignoreChildren(ty)) return;
    if (ty.owningArena !== this.arena) return;
    const v = ty.ty;
    switch (v.kind) {
      case "FunctionType":
        v.generics = v.generics.map((g) => this.replace(g));
        v.genericPacks = v.genericPacks.map((g) => this.replacePack(g));
        v.argTypes = this.replacePack(v.argTypes);
        v.retTypes = this.replacePack(v.retTypes);
        break;
      case "TableType":
        for (const [, prop] of v.props) {
          if (prop.readTy) prop.readTy = this.replace(prop.readTy);
          if (prop.writeTy) prop.writeTy = this.replace(prop.writeTy);
        }
        if (v.indexer) {
          v.indexer.indexType = this.replace(v.indexer.indexType);
          v.indexer.indexResultType = this.replace(v.indexer.indexResultType);
        }
        v.instantiatedTypeParams = v.instantiatedTypeParams.map((t) => this.replace(t));
        v.instantiatedTypePackParams = v.instantiatedTypePackParams.map((t) => this.replacePack(t));
        break;
      case "MetatableType":
        v.table = this.replace(v.table);
        v.metatable = this.replace(v.metatable);
        break;
      case "UnionType":
        v.options = v.options.map((t) => this.replace(t));
        break;
      case "IntersectionType":
        v.parts = v.parts.map((t) => this.replace(t));
        break;
      case "PendingExpansionType":
      case "TypeFunctionInstanceType":
        v.typeArguments = v.typeArguments.map((t) => this.replace(t));
        v.packArguments = v.packArguments.map((t) => this.replacePack(t));
        break;
      case "ExternType":
        for (const [, prop] of v.props) {
          if (prop.readTy) prop.readTy = this.replace(prop.readTy);
          if (prop.writeTy) prop.writeTy = this.replace(prop.writeTy);
        }
        if (v.parent) v.parent = this.replace(v.parent);
        if (v.metatable) v.metatable = this.replace(v.metatable);
        if (v.indexer) {
          v.indexer.indexType = this.replace(v.indexer.indexType);
          v.indexer.indexResultType = this.replace(v.indexer.indexResultType);
        }
        break;
      case "NegationType":
        v.ty = this.replace(v.ty);
        break;
      default:
        break;
    }
  }

  replaceChildrenPack(tp: TypePackId): void {
    if (this.ignoreChildrenPack(tp)) return;
    if (tp.owningArena !== this.arena) return;
    const v = tp.ty;
    if (v.kind === "TypePack") {
      v.head = v.head.map((t) => this.replace(t));
      if (v.tail) v.tail = this.replacePack(v.tail);
    } else if (v.kind === "VariadicTypePack") {
      v.ty = this.replace(v.ty);
    } else if (v.kind === "TypeFunctionInstanceTypePack") {
      v.typeArguments = v.typeArguments.map((t) => this.replace(t));
      v.packArguments = v.packArguments.map((t) => this.replacePack(t));
    }
  }
}
