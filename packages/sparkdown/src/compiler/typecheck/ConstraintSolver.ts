// The constraint solver, ported from Luau's `ConstraintSolver.h`/
// `ConstraintSolver.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).
//
// The solver dispatches the constraints that constraint generation produced.
// A constraint is dispatched once the constraint graph has nothing
// outstanding that it depends on; when no constraint can make progress that
// way, the first one that succeeds when forced is forced. Dispatching binds
// blocked types and narrows the bounds of free types, and a free type that no
// outstanding constraint can change any more is generalized at once. The
// order of dispatch decides the inferred types and the order of the errors.

import { ApplyTypeFunction } from "./ApplyTypeFunction";
import { findUniqueTypesIn } from "./AstUtils";
import { shallowClone } from "./Clone";
import {
  Constraint,
  ValueContext,
  type AssignIndexConstraint,
  type AssignPropConstraint,
  type ConstraintSet,
  type ConstraintV,
  type EqualityConstraint,
  type FunctionCallConstraint,
  type FunctionCheckConstraint,
  type GeneralizationConstraint,
  type HasIndexerConstraint,
  type HasPropConstraint,
  type IterableConstraint,
  type NameConstraint,
  type PackSubtypeConstraint,
  type PushFunctionTypeConstraint,
  type PushTypeConstraint,
  type ReduceConstraint,
  type ReducePackConstraint,
  type SimplifyConstraint,
  type SubtypeConstraint,
  type TypeAliasExpansionConstraint,
  type TypeInstantiationConstraint,
  type UnpackConstraint,
} from "./Constraint";
import type { ConstraintGraph } from "./ConstraintGraph";
import type { DataFlowGraph } from "./DataFlowGraph";
import { LuauTypeError, UnknownSymbolContext, type TypeErrorData } from "./Error";
import { generalize, generalizeType, generalizeTypePack, pruneUnnecessaryGenerics, sealTable, type GeneralizationParams } from "./Generalization";
import { instantiate } from "./Instantiation";
import { instantiate2, instantiate2Pack, Replacer } from "./Instantiation2";
import { IterativeTypeVisitor } from "./IterativeTypeVisitor";
import { Location } from "./Location";
import type { Module, ModuleInfo, ModuleResolver, RequireCycle } from "./Module";
import type { Normalizer } from "./Normalize";
import { OverloadResolver } from "./OverloadResolver";
import type { Scope } from "./Scope";
import * as Simplify from "./Simplify";
import type { Substitution } from "./Substitution";
import { SubtypingVariance, type Subtyping } from "./Subtyping";
import { pushTypeInto } from "./TableLiteralInference";
import type { ToStringOptions } from "./ToString";
import {
  blockedType,
  blockedTypePack,
  boundType,
  boundTypePack,
  emplaceType,
  emplaceTypePack,
  finite,
  first,
  flatOptions,
  flatten,
  follow,
  followPack,
  freshType,
  functionType,
  get,
  getPack,
  getTableType,
  InternalCompilerError,
  intersectionType,
  is,
  isString,
  lookupExternTypeProp,
  maybeSingleton,
  maybeString,
  packSize,
  Polarity,
  PrimitiveKind,
  Property,
  stringSingleton,
  TableIndexer,
  TableState,
  tableType,
  typeFunctionInstanceType,
  TypeFunctionInstanceState,
  unionType,
  type BlockedType,
  type BuiltinTypes,
  type FreeType,
  type IntersectionType,
  type Props,
  type TableType,
  type TypeArena,
  type TypeFun,
  type TypeId,
  type TypePackId,
  type TypeVariant,
  type UnionType,
} from "./Type";
import { reduceTypeFunctions, reduceTypeFunctionsPack, TypeFunctionContext, type TypeCheckLimits, type TypeFunctionRuntime } from "./TypeFunction";
import { TypeIds } from "./TypeIds";
import {
  addUnion,
  extendTypePack,
  fastIsSubtype,
  findMetatableEntry,
  getApproximateReturnTypeForFunctionCall,
  IntersectionBuilder,
  occursCheck,
  occursCheckPack,
  OccursCheckResult,
  trackInteriorFreeType,
  trackInteriorFreeTypePack,
  UnionBuilder,
  unwrapGroup,
} from "./TypeUtils";
import { Unifier2, UnifyResult } from "./Unifier2";
import { RecursionLimitError, TypeOnceVisitor, TypeVisitor } from "./VisitType";

// Luau's `LuauSolverConstraintLimit`.
const SOLVER_CONSTRAINT_LIMIT = 1000;
// Luau's `LuauSolverRecursionLimit`.
const SOLVER_RECURSION_LIMIT = 500;

/** A subtype or equality constraint the solver has pushed; the solver pushes each one only once. */
export interface SubtypeConstraintRecord {
  subTy: TypeId;
  superTy: TypeId;
  variance: SubtypingVariance;
}

/** A key for a `SubtypeConstraintRecord`, equal for equal records (Luau's `operator==` and `HashSubtypeConstraintRecord`). */
export function subtypeConstraintRecordKey(record: SubtypeConstraintRecord): string {
  return `${record.subTy.serial},${record.superTy.serial},${record.variance}`;
}

/** A type alias applied to arguments. */
export interface InstantiationSignature {
  fn: TypeFun;
  arguments: TypeId[];
  packArguments: TypePackId[];
}

/**
 * A key for an `InstantiationSignature`, equal for signatures of the same alias (its type, and its type parameters
 * with their defaults) and the same arguments (Luau's `operator==` and `HashInstantiationSignature`).
 */
export function instantiationSignatureKey(signature: InstantiationSignature): string {
  const { fn } = signature;
  return [
    String(fn.type.serial),
    fn.typeParams.map((p) => `${p.ty.serial}=${p.defaultValue?.serial ?? ""}`).join(","),
    fn.typePackParams.map((p) => `${p.tp.serial}=${p.defaultValue?.serial ?? ""}`).join(","),
    signature.arguments.map((a) => a.serial).join(","),
    signature.packArguments.map((a) => a.serial).join(","),
  ].join("|");
}

export interface TablePropLookupResult {
  /** The types the lookup is blocked on. */
  blockedTypes: TypeId[];
  /** The type of the property, when it could be determined. */
  propType: TypeId | undefined;
  /**
   * Whether the type definitely comes from an indexer. This decides whether `t.lol = nil` is legal: it is when
   * `t: { [string]: ~nil }`, as "lol" need not exist, but not when `t: { lol: ~nil }`, as the assignment would remove
   * "lol" from the table.
   */
  isIndex: boolean;
}

function lookupResult(blockedTypes: TypeId[], propType: TypeId | undefined, isIndex = false): TablePropLookupResult {
  return { blockedTypes, propType, isIndex };
}

/**
 * The arguments of an alias application with one argument for each of the alias's type and pack parameters: surplus
 * types go into a pack, a single-type pack can stand for a missing type, defaults fill in what was left out, and
 * error types fill in the rest.
 */
export function saturateArguments(
  arena: TypeArena,
  builtinTypes: BuiltinTypes,
  fn: TypeFun,
  rawTypeArguments: TypeId[],
  rawPackArguments: TypePackId[],
): [TypeId[], TypePackId[]] {
  const saturatedTypeArguments: TypeId[] = [];
  const extraTypes: TypeId[] = [];
  const saturatedPackArguments: TypePackId[] = [];

  for (let i = 0; i < rawTypeArguments.length; ++i) {
    const ty = rawTypeArguments[i]!;

    if (i < fn.typeParams.length) saturatedTypeArguments.push(ty);
    else extraTypes.push(ty);
  }

  // Extra types go into a type pack. This never happens together with the conversion of a type pack to a type below,
  // as there are extra types only when there are more types than type parameters for them to go into.
  if (extraTypes.length && fn.typePackParams.length) {
    saturatedPackArguments.push(arena.addTypePack(extraTypes));
  }

  for (let i = 0; i < rawPackArguments.length; ++i) {
    const tp = rawPackArguments[i]!;

    // Short of type arguments, a type pack of a single element stands for the type it holds.
    if (
      saturatedTypeArguments.length < fn.typeParams.length &&
      packSize(tp) === 1 &&
      finite(tp) &&
      first(tp) &&
      saturatedPackArguments.length === 0
    ) {
      saturatedTypeArguments.push(first(tp)!);
    } else if (saturatedPackArguments.length < fn.typePackParams.length) {
      saturatedPackArguments.push(tp);
    }
  }

  const typesProvided = saturatedTypeArguments.length;
  const typesRequired = fn.typeParams.length;

  const packsProvided = saturatedPackArguments.length;
  const packsRequired = fn.typePackParams.length;

  // Defaults are not used when a pack was provided without enough types, as that is an error to report rather than
  // one to hide behind the defaults. With enough types but not enough packs, the default packs are used.
  const needsDefaults = (typesProvided < typesRequired && packsProvided === 0) || (typesProvided === typesRequired && packsProvided < packsRequired);

  if (needsDefaults) {
    // Defaults can refer to earlier parameters, as in `type T<A, B = A> = (A, B) -> number`, so they go through an
    // `ApplyTypeFunction`.
    const atf = new ApplyTypeFunction(arena);

    for (let i = 0; i < typesProvided; ++i) atf.typeArguments.set(fn.typeParams[i]!.ty, saturatedTypeArguments[i]!);

    for (let i = typesProvided; i < typesRequired; ++i) {
      const defaultTy = fn.typeParams[i]!.defaultValue;

      // The error type fills this in later.
      if (!defaultTy) break;

      const instantiatedDefault = atf.substitute(defaultTy) ?? builtinTypes.errorType;
      atf.typeArguments.set(fn.typeParams[i]!.ty, instantiatedDefault);
      saturatedTypeArguments.push(instantiatedDefault);
    }

    for (let i = 0; i < packsProvided; ++i) {
      atf.typePackArguments.set(fn.typePackParams[i]!.tp, saturatedPackArguments[i]!);
    }

    for (let i = packsProvided; i < packsRequired; ++i) {
      const defaultTp = fn.typePackParams[i]!.defaultValue;

      // The error type pack fills this in later.
      if (!defaultTp) break;

      const instantiatedDefault = atf.substitutePack(defaultTp) ?? builtinTypes.errorTypePack;
      atf.typePackArguments.set(fn.typePackParams[i]!.tp, instantiatedDefault);
      saturatedPackArguments.push(instantiatedDefault);
    }
  }

  // Without an extra type pack made from surplus types, a single missing type pack is the empty pack.
  if (extraTypes.length === 0 && saturatedPackArguments.length + 1 === fn.typePackParams.length) {
    saturatedPackArguments.push(arena.addTypePack([]));
  }

  // Substituting the generics needs something for each of them, even the missing ones, so the error type fills in.
  for (let i = saturatedTypeArguments.length; i < typesRequired; ++i) {
    saturatedTypeArguments.push(builtinTypes.errorType);
  }

  for (let i = saturatedPackArguments.length; i < packsRequired; ++i) {
    saturatedPackArguments.push(builtinTypes.errorTypePack);
  }

  for (let i = 0; i < saturatedTypeArguments.length; ++i) saturatedTypeArguments[i] = follow(saturatedTypeArguments[i]!);

  for (let i = 0; i < saturatedPackArguments.length; ++i) saturatedPackArguments[i] = followPack(saturatedPackArguments[i]!);

  return [saturatedTypeArguments, saturatedPackArguments];
}

/** A new list of the same constraints (Luau borrows the pointers of a list of owned constraints). */
export function borrowConstraints(constraints: Constraint[]): Constraint[] {
  return [...constraints];
}

/** Removes the elements at the front of `vec` for as long as `pred` holds for them. */
export function dropWhile<T>(vec: T[], pred: (elem: T) => boolean): void {
  const it = vec.findIndex((elem) => !pred(elem));
  vec.splice(0, it === -1 ? vec.length : it);
}

/** Queues the expansion of the pending aliases and the reduction of the type function instances in a type. */
class InstantiationQueuer extends IterativeTypeVisitor {
  constructor(
    readonly scope: Scope,
    readonly location: Location,
    readonly solver: ConstraintSolver,
    readonly moduleName: string | undefined,
  ) {
    super("InstantiationQueuer", /* skipBoundTypes */ true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "PendingExpansionType":
        if (!this.solver.typeAliasesToExpand.has(ty)) {
          this.solver.typeAliasesToExpand.set(
            ty,
            this.solver.pushConstraint(this.scope, this.location, { kind: "TypeAliasExpansionConstraint", target: ty }, this.moduleName),
          );
        }
        return false;
      case "TypeFunctionInstanceType":
        if (!this.solver.typeFunctionsToFinalize.has(ty)) {
          this.solver.typeFunctionsToFinalize.set(
            ty,
            this.solver.pushConstraint(this.scope, this.location, { kind: "ReduceConstraint", ty }, this.moduleName),
          );
        }
        return true;
      case "ExternType":
        return false;
      default:
        return this.visit(ty);
    }
  }
}

/** Finds an expansion of an alias, within its own type, with arguments other than its own type parameters. */
class InfiniteTypeFinder extends IterativeTypeVisitor {
  foundInfiniteType = false;

  constructor(
    readonly solver: ConstraintSolver,
    readonly signature: InstantiationSignature,
    readonly scope: Scope,
  ) {
    super("InfiniteTypeFinder", /* skipBoundTypes */ true);
  }

  override visit(_ty: TypeId): boolean {
    return !this.foundInfiniteType;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    if (v.kind !== "PendingExpansionType") return this.visit(ty);

    const petv = v;
    if (this.foundInfiniteType) return false;

    const tf = petv.prefix !== undefined ? this.scope.lookupImportedType(petv.prefix, petv.name) : this.scope.lookupType(petv.name);

    if (!tf) return true;

    // Different types mean two different aliases.
    if (follow(tf.type) !== follow(this.signature.fn.type)) return true;

    // The arguments to this pending expansion have to be exactly the alias's generics.
    for (let i = 0; i < Math.min(petv.typeArguments.length, tf.typeParams.length); ++i) {
      const pendingTypeArg = follow(petv.typeArguments[i]!);
      const tfTypeParam = follow(tf.typeParams[i]!.ty);
      if (is(pendingTypeArg, "ErrorType") || is(tfTypeParam, "ErrorType")) continue;

      if (pendingTypeArg !== tfTypeParam) {
        this.foundInfiniteType = true;
        return false;
      }
    }

    // Likewise with packs.
    for (let i = 0; i < Math.min(petv.packArguments.length, tf.typePackParams.length); ++i) {
      if (petv.packArguments[i] !== tf.typePackParams[i]!.tp) {
        this.foundInfiniteType = true;
        return false;
      }
    }

    return false;
  }
}

/** Counts the occurrences of a type within another, and records the polarities it occurs with. */
export class TypeSearcher extends TypeVisitor {
  current: Polarity;

  count = 0;
  result = Polarity.None;

  constructor(
    readonly needle: TypeId,
    initialPolarity = Polarity.Positive,
  ) {
    super("TypeSearcher", /* skipBoundTypes */ true);
    this.current = initialPolarity;
  }

  override visit(ty: TypeId): boolean {
    if (ty === this.needle) {
      ++this.count;
      this.result = (this.result | this.current) as Polarity;
    }

    return true;
  }

  flip(): void {
    switch (this.current) {
      case Polarity.Positive:
        this.current = Polarity.Negative;
        break;
      case Polarity.Negative:
        this.current = Polarity.Positive;
        break;
      default:
        break;
    }
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "FunctionType":
        this.flip();
        this.traversePack(v.argTypes);

        this.flip();
        this.traversePack(v.retTypes);

        return false;
      case "ExternType":
        return false;
      default:
        return this.visit(ty);
    }
  }
}

class BlockedTypeFinder extends TypeOnceVisitor {
  blocked: TypeId | undefined;

  constructor() {
    super("ContainsGenerics_DEPRECATED", /* skipBoundTypes */ true);
  }

  override visit(_ty: TypeId): boolean {
    // Once one is found, the traversal stops.
    return this.blocked === undefined;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    if (v.kind === "BlockedType") {
      this.blocked = ty;
      return false;
    }
    return this.visit(ty);
  }
}

/** Collects the members of a union, sorting out the ones that may still change. */
class FindAllUnionMembers extends TypeOnceVisitor {
  readonly recordedTys = new TypeIds();
  readonly blockedTys = new TypeIds();

  constructor() {
    super("FindAllUnionMembers", /* skipBoundTypes */ true);
  }

  override visit(ty: TypeId): boolean {
    this.recordedTys.insert(ty);
    return false;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "BlockedType":
      case "PendingExpansionType":
      case "FreeType":
      case "TypeFunctionInstanceType":
        this.blockedTys.insert(ty);
        return false;
      case "UnionType":
        return true;
      case "TableType":
        if (v.state !== TableState.Sealed) this.blockedTys.insert(ty);
        else this.recordedTys.insert(ty);
        return false;
      default:
        return this.visit(ty);
    }
  }
}

/**
 * The type a free type standing for a literal generalizes to: its lower bound when its upper bound, other than the
 * literal's primitive type, may be a singleton, and that primitive type otherwise.
 */
function resolvePrimitiveLiteral(ft: FreeType): TypeId | undefined {
  if (!ft.primitiveType) return undefined;

  const bindTo = ft.primitiveType;
  const upper = follow(ft.upperBound);

  if (upper !== bindTo && maybeSingleton(upper)) return follow(ft.lowerBound);

  return bindTo;
}

/** The value under `key`, inserting `make()` first when there is none, as `operator[]` on a C++ map. */
function getOrInsert<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

/** A table's property by name, added empty when it is missing, as `props[name]` on Luau's `std::map`. */
function propertyAt(props: Props, name: string): Property {
  let prop = props.get(name);
  if (!prop) {
    prop = new Property();
    props.set(name, prop);
  }
  return prop;
}

/** Luau's `BlockedType::setOwner`: a blocked type keeps the first owner it is given. */
function setOwner(blocked: BlockedType, owner: Constraint): void {
  if (blocked.owner !== undefined) return;
  blocked.owner = owner;
}

function bySerial(a: TypeId, b: TypeId): number {
  return a.serial - b.serial;
}

/** Luau's `IllegalRequire` error. `TypeErrorData` has no such kind, so the data is cast. */
function illegalRequire(moduleName: string, reason: string): TypeErrorData {
  return { kind: "IllegalRequire", moduleName, reason } as unknown as TypeErrorData;
}

/**
 * Whether a module is a module script (Luau's `module->type == SourceCode::Module`). `Module` does not record the type
 * of its source, so every module counts as one.
 */
function isModuleScript(_module: Module): boolean {
  return true;
}

/**
 * Dispatches the constraints of a module, and the ones that dispatching them adds, until none are left or none can
 * make progress.
 */
export class ConstraintSolver {
  readonly arena: TypeArena;
  readonly builtinTypes: BuiltinTypes;
  readonly normalizer: Normalizer;
  readonly typeFunctionRuntime: TypeFunctionRuntime;
  /** The entire set of constraints that the solver is trying to resolve. */
  readonly constraintSet: ConstraintSet;
  readonly constraints: Constraint[];
  readonly scopeToFunction: Map<Scope, TypeId>;
  readonly rootScope: Scope;
  readonly module: Module;
  /** The module that errors of the solve as a whole, such as `ConstraintSolvingIncompleteError`, are reported in. */
  readonly representativeModuleName: string;

  /** The data flow graph of the program, used in constraint generation and by magic functions. */
  readonly dfg: DataFlowGraph;

  /** The constraints the solver generated itself, rather than taking them from constraint generation. */
  readonly solverConstraints: Constraint[] = [];

  /**
   * Counts down each time the solver pushes a constraint. When it reaches zero, the solver reports that the code is
   * too complex and stops dispatching.
   */
  solverConstraintLimit: number;

  /** Every constraint that has not been fully solved. A constraint can be both blocked and unsolved. */
  readonly unsolvedConstraints: Constraint[] = [];

  /** Memoized instantiations of type aliases, keyed by `instantiationSignatureKey`. */
  readonly instantiatedAliases = new Map<string, TypeId>();
  /**
   * Where each free type's upper bound was expanded, for more helpful messages when a free type is unexpectedly
   * solved as `never`.
   */
  readonly upperBoundContributors = new Map<TypeId, [Location, TypeId][]>();

  /** Irreducible or uninhabited type function and type pack function instances. */
  readonly uninhabitedTypeFunctions = new Set<object>();

  /** The subtype and equality constraints the solver pushed, keyed by `subtypeConstraintRecordKey`. */
  readonly seenConstraints = new Map<string, Constraint>();

  /** The types that generalization will definitely leave unchanged. */
  readonly generalizedTypes = new Set<TypeId>();

  /** The errors found while solving. */
  readonly errors: LuauTypeError[] = [];

  readonly moduleResolver: ModuleResolver;
  readonly requireCycles: RequireCycle[];

  readonly limits: TypeCheckLimits;

  readonly typeFunctionsToFinalize = new Map<TypeId, Constraint>();
  readonly typeAliasesToExpand = new Map<TypeId, Constraint>();

  readonly opts: ToStringOptions = { exhaustive: true };

  readonly cgraph: ConstraintGraph;

  readonly subtyping: Subtyping;

  constructor(
    normalizer: Normalizer,
    typeFunctionRuntime: TypeFunctionRuntime,
    module: Module,
    moduleResolver: ModuleResolver,
    requireCycles: RequireCycle[],
    dfg: DataFlowGraph,
    limits: TypeCheckLimits,
    constraintSet: ConstraintSet,
    cgraph: ConstraintGraph,
    subtyping: Subtyping,
  ) {
    this.arena = normalizer.arena;
    this.builtinTypes = normalizer.builtinTypes;
    this.normalizer = normalizer;
    this.typeFunctionRuntime = typeFunctionRuntime;
    this.constraintSet = constraintSet;
    this.constraints = borrowConstraints(cgraph.constraints);
    this.scopeToFunction = cgraph.scopeToFunction;
    this.rootScope = constraintSet.rootScope;
    this.module = module;
    this.representativeModuleName = module.name;
    this.dfg = dfg;
    this.solverConstraintLimit = SOLVER_CONSTRAINT_LIMIT;
    this.moduleResolver = moduleResolver;
    this.requireCycles = requireCycles;
    this.limits = limits;
    this.cgraph = cgraph;
    this.subtyping = subtyping;

    this.initFreeTypeTracking();
  }

  /** Tries to dispatch every pending constraint, to reach types that satisfy all of them. */
  run(): void {
    if (this.isDone()) return;

    // Free types that have no constraints at all can be generalized right away.
    const freeTypesToProcess = this.cgraph.freeTypes;
    for (const ty of freeTypesToProcess) {
      if (!this.cgraph.hasUnsolvedDependencies(ty)) this.generalizeOneType(ty);
    }
    freeTypesToProcess.clear();

    if (this.constraintSet.deferredConstraints.length === 1) {
      this.unsolvedConstraints.push(this.constraintSet.deferredConstraints[0]!);
    }

    const runSolverPass = (force: boolean): boolean => {
      let progress = false;

      let i = 0;
      while (i < this.unsolvedConstraints.length) {
        const c = this.unsolvedConstraints[i]!;
        if (!force && this.cgraph.hasUnsolvedDependencies(c)) {
          i++;
          continue;
        }

        // With a limit on the constraints the solver may push, solving stops once it runs out.
        if (SOLVER_CONSTRAINT_LIMIT > 0 && this.solverConstraintLimit === 0) break;

        const success = this.tryDispatch(c, force);

        progress = progress || success;

        if (success) {
          const unblockResult = this.cgraph.unblockConstraint(c);

          this.unsolvedConstraints.splice(i, 1);

          for (const ty of unblockResult.types) {
            if (!this.cgraph.hasUnsolvedDependencies(ty)) {
              this.generalizeOneType(ty);
              this.unblock(ty, new Location());
            }
          }

          // Free type packs are never generalized eagerly.
        } else ++i;

        if (force && success) return true;
      }

      return progress;
    };

    let progress = false;
    do {
      progress = runSolverPass(false);
      if (!progress) progress = runSolverPass(true);
    } while (progress);

    if (this.unsolvedConstraints.length) {
      this.reportError({ kind: "ConstraintSolvingIncompleteError" }, new Location(), this.representativeModuleName);
    }

    for (const constraint of this.constraintSet.deferredConstraints) {
      if (get(follow(constraint.get("GeneralizationConstraint")!.generalizedType), "BlockedType")) this.tryDispatch(constraint, true);
    }

    // With every constraint run, the type functions should be generalized; one final reduction tells whether they are
    // truly uninhabited or can reduce.
    this.finalizeTypeFunctions();
  }

  /** Tries one final reduction of the type functions still unreduced, once every constraint has run. */
  finalizeTypeFunctions(): void {
    // Generalization is done, so as much as possible is reduced; the warnings are left to the type checker.
    for (const [t, constraint] of this.typeFunctionsToFinalize) {
      const ty = follow(t);
      if (get(ty, "TypeFunctionInstanceType")) {
        const context = TypeFunctionContext.fromSolver(this, constraint.scope, constraint, this.subtyping);
        const result = reduceTypeFunctions(t, constraint.location, context, true);

        for (const r of result.reducedTypes) this.unblock(r, constraint.location);
        for (const r of result.reducedPacks) this.unblockPack(r, constraint.location);
      }
    }
  }

  isDone(): boolean {
    return this.unsolvedConstraints.length === 0;
  }

  private initFreeTypeTracking(): void {
    for (const c of this.constraints) {
      this.unsolvedConstraints.push(c);

      const { types, typePacks } = c.getMaybeMutatedTypes();

      for (const ty of types) this.cgraph.addDependencyOf(c, ty);

      for (const tp of typePacks) this.cgraph.addDependencyOf(c, tp);
    }
  }

  private generalizeOneType(ty: TypeId): void {
    ty = follow(ty);
    const freeTy = get(ty, "FreeType");

    // Some constraints also replace a free type with something concrete, which leaves nothing to do.
    if (!freeTy) return;

    const bindTo = resolvePrimitiveLiteral(freeTy);
    if (bindTo && ty !== bindTo) {
      emplaceType(ty, boundType(bindTo));
      return;
    }

    let functionTy: TypeId | undefined;

    for (let scope = freeTy.scope; !functionTy && scope; scope = scope.parent) functionTy = this.scopeToFunction.get(scope);

    if (!functionTy) return;

    generalize(this.arena, this.builtinTypes, freeTy.scope!, this.generalizedTypes, functionTy, ty);
  }

  /**
   * Binds a blocked, free or pending type to another type, and unblocks it. A blocked type must be owned by the
   * constraint, which keeps one constraint from interfering with another's blocked types.
   */
  bind(constraint: Constraint, ty: TypeId, boundTo: TypeId): void {
    boundTo = follow(boundTo);

    // `ty` is followed in case it is somehow already bound.
    if (follow(ty) === boundTo) {
      const freshTy = freshType(this.arena, this.builtinTypes, constraint.scope, Polarity.Mixed);
      emplaceType(ty, boundType(freshTy));
      trackInteriorFreeType(constraint.scope, freshTy);
      this.unblock(ty, constraint.location);
      return;
    }

    emplaceType(ty, boundType(boundTo));

    this.unblock(ty, constraint.location);
  }

  bindPack(constraint: Constraint, tp: TypePackId, boundTo: TypePackId): void {
    boundTo = followPack(boundTo);

    if (occursCheckPack(tp, boundTo) === OccursCheckResult.Fail) {
      this.reportError(
        { kind: "InternalError", message: "Attempted to create a type pack cycle" },
        constraint.location,
        this.moduleNameOf(constraint),
      );
      emplaceTypePack(tp, boundTypePack(this.builtinTypes.errorTypePack));
    } else {
      emplaceTypePack(tp, boundTypePack(boundTo));
    }

    this.unblockPack(tp, constraint.location);
  }

  /**
   * Tries to dispatch a constraint, and returns whether it succeeded. A constraint that did not stays unsolved and is
   * tried again later.
   */
  tryDispatch(constraint: Constraint, force: boolean): boolean {
    let success = false;

    const c = constraint.c;
    switch (c.kind) {
      case "SubtypeConstraint":
        success = this.tryDispatchSubtypeConstraint(c, constraint);
        break;
      case "PackSubtypeConstraint":
        success = this.tryDispatchPackSubtypeConstraint(c, constraint);
        break;
      case "GeneralizationConstraint":
        success = this.tryDispatchGeneralizationConstraint(c, constraint);
        break;
      case "IterableConstraint":
        success = this.tryDispatchIterableConstraint(c, constraint, force);
        break;
      case "NameConstraint":
        success = this.tryDispatchNameConstraint(c, constraint);
        break;
      case "TypeAliasExpansionConstraint":
        success = this.tryDispatchTypeAliasExpansionConstraint(c, constraint);
        break;
      case "FunctionCallConstraint":
        success = this.tryDispatchFunctionCallConstraint(c, constraint);
        break;
      case "FunctionCheckConstraint":
        success = this.tryDispatchFunctionCheckConstraint(c, constraint, force);
        break;
      case "HasPropConstraint":
        success = this.tryDispatchHasPropConstraint(c, constraint);
        break;
      case "HasIndexerConstraint":
        success = this.tryDispatchHasIndexerConstraint(c, constraint);
        break;
      case "AssignPropConstraint":
        success = this.tryDispatchAssignPropConstraint(c, constraint);
        break;
      case "AssignIndexConstraint":
        success = this.tryDispatchAssignIndexConstraint(c, constraint);
        break;
      case "UnpackConstraint":
        success = this.tryDispatchUnpackConstraint(c, constraint);
        break;
      case "ReduceConstraint":
        success = this.tryDispatchReduceConstraint(c, constraint, force);
        break;
      case "ReducePackConstraint":
        success = this.tryDispatchReducePackConstraint(c, constraint, force);
        break;
      case "EqualityConstraint":
        success = this.tryDispatchEqualityConstraint(c, constraint);
        break;
      case "SimplifyConstraint":
        success = this.tryDispatchSimplifyConstraint(c, constraint, force);
        break;
      case "PushFunctionTypeConstraint":
        success = this.tryDispatchPushFunctionTypeConstraint(c, constraint);
        break;
      case "TypeInstantiationConstraint":
        success = this.tryDispatchTypeInstantiationConstraint(c, constraint);
        break;
      case "PushTypeConstraint":
        success = this.tryDispatchPushTypeConstraint(c, constraint, force);
        break;
    }

    return success;
  }

  tryDispatchSubtypeConstraint(c: SubtypeConstraint, constraint: Constraint): boolean {
    if (this.isBlocked(c.subType)) return this.block(c.subType, constraint);
    else if (this.isBlocked(c.superType)) return this.block(c.superType, constraint);

    this.unify(constraint, c.subType, c.superType);

    return true;
  }

  tryDispatchPackSubtypeConstraint(c: PackSubtypeConstraint, constraint: Constraint): boolean {
    if (this.isBlockedPack(c.subPack)) return this.blockPack(c.subPack, constraint);
    else if (this.isBlockedPack(c.superPack)) return this.blockPack(c.superPack, constraint);

    this.unifyPack(constraint, c.subPack, c.superPack);

    return true;
  }

  tryDispatchGeneralizationConstraint(c: GeneralizationConstraint, constraint: Constraint): boolean {
    const generalizedType = follow(c.generalizedType);

    if (this.isBlocked(c.sourceType)) return this.block(c.sourceType, constraint);
    else if (get(generalizedType, "PendingExpansionType")) return this.block(generalizedType, constraint);

    const generalizedTy = generalize(this.arena, this.builtinTypes, constraint.scope, this.generalizedTypes, c.sourceType);
    if (!generalizedTy) this.reportError({ kind: "CodeTooComplex" }, constraint.location, this.moduleNameOf(constraint));

    if (generalizedTy) {
      pruneUnnecessaryGenerics(this.arena, this.builtinTypes, constraint.scope, this.generalizedTypes, generalizedTy);
      if (get(generalizedType, "BlockedType")) this.bind(constraint, generalizedType, generalizedTy);
      else this.unify(constraint, generalizedType, generalizedTy);

      const fty = get(follow(generalizedType), "FunctionType");
      if (fty) {
        if (c.maybeDeprecatedAttr) {
          fty.isDeprecatedFunction = true;
          // The attribute's deprecation details (Luau's `deprecatedInfo`) have no field on the function type to go in.
        }
      }
    } else {
      this.reportError({ kind: "CodeTooComplex" }, constraint.location, this.moduleNameOf(constraint));
      this.bind(constraint, c.generalizedType, this.builtinTypes.errorType);
    }

    // The loops go over the types present when they start.
    if (constraint.scope.interiorFreeTypes) {
      for (let ty of [...constraint.scope.interiorFreeTypes]) {
        ty = follow(ty);
        const freeTy = get(ty, "FreeType");
        if (freeTy) {
          const params: GeneralizationParams = { foundOutsideFunctions: true, useCount: 1, polarity: freeTy.polarity };
          const res = generalizeType(this.arena, this.builtinTypes, constraint.scope, ty, params);
          if (res.resourceLimitsExceeded) {
            // The scope's location is not a very good location for this.
            this.reportError({ kind: "CodeTooComplex" }, constraint.scope.location, this.moduleNameOf(constraint));
          }
        } else if (get(ty, "TableType")) sealTable(constraint.scope, ty);

        this.unblock(ty, constraint.location);
      }
    }

    if (constraint.scope.interiorFreeTypePacks) {
      for (let tp of [...constraint.scope.interiorFreeTypePacks]) {
        tp = followPack(tp);
        const freeTp = getPack(tp, "FreeTypePack");
        if (freeTp) {
          const params: GeneralizationParams = { foundOutsideFunctions: true, useCount: 1, polarity: freeTp.polarity };
          generalizeTypePack(this.arena, this.builtinTypes, constraint.scope, tp, params);
        }
      }
    }

    if (c.noGenerics) {
      const ft = get(c.sourceType, "FunctionType");
      if (ft) {
        for (const gen of ft.generics) gen.ty = boundType(this.builtinTypes.unknownType);
        ft.generics = [];

        for (const gen of ft.genericPacks) gen.ty = boundTypePack(this.builtinTypes.unknownTypePack);
        ft.genericPacks = [];
      }
    }

    return true;
  }

  tryDispatchIterableConstraint(c: IterableConstraint, constraint: Constraint, force: boolean): boolean {
    // An iterable constraint is never forced.
    force = false;

    // A `for ... in` loop plays out differently depending on the shape of the iteratee, which may be a next function
    // (alone, with a table, or with a table and a first index); a table with a metatable and `__index`; a table with
    // a metatable and `__call` but no `__index` (`__index` wins when there are both); or a table with an indexer but
    // no `__index` or `__call` (or no metatable). Dispatching this needs enough of the iteratee's type to tell which
    // shape it is, and a forced constraint that still cannot tell has to flag a warning. As it needs so much of the
    // iteratee's type, the solver is also what applies the constraints on the types of the iterators.

    const block_ = (t: TypePackId): boolean => {
      if (force) {
        // With the iteratee's type still unknown, there is nothing to do.
        return true;
      }

      this.blockPack(t, constraint);
      return false;
    };

    const iterator = extendTypePack(this.arena, this.builtinTypes, c.iterator, 3);
    if (iterator.head.length < 3 && iterator.tail && this.isBlockedPack(iterator.tail)) return block_(iterator.tail);

    {
      let blocked = false;
      for (const t of iterator.head) {
        if (this.isBlocked(t)) {
          this.block(t, constraint);
          blocked = true;
        }
      }

      if (blocked) return false;
    }

    if (0 === iterator.head.length) {
      for (const ty of c.variables) this.bind(constraint, ty, this.builtinTypes.errorType);
      return true;
    }

    const nextTy = follow(iterator.head[0]!);
    if (get(nextTy, "FreeType")) {
      const keyTy = freshType(this.arena, this.builtinTypes, constraint.scope, Polarity.Mixed);
      const valueTy = freshType(this.arena, this.builtinTypes, constraint.scope, Polarity.Mixed);
      trackInteriorFreeType(constraint.scope, keyTy);
      trackInteriorFreeType(constraint.scope, valueTy);
      const tableTy = this.arena.addType(tableType({ indexer: new TableIndexer(keyTy, valueTy), scope: constraint.scope, state: TableState.Free }));

      trackInteriorFreeType(constraint.scope, tableTy);

      this.unify(constraint, nextTy, tableTy);

      let it = 0;
      const endIt = c.variables.length;

      if (it !== endIt) {
        this.bind(constraint, c.variables[it]!, keyTy);
        ++it;
      }
      if (it !== endIt) {
        this.bind(constraint, c.variables[it]!, valueTy);
        ++it;
      }

      while (it !== endIt) {
        this.bind(constraint, c.variables[it]!, this.builtinTypes.nilType);
        ++it;
      }

      return true;
    }

    if (get(nextTy, "FunctionType")) {
      let tableTy = this.builtinTypes.nilType;
      if (iterator.head.length >= 2) tableTy = iterator.head[1]!;

      return this.tryDispatchIterableFunction(nextTy, tableTy, c, constraint);
    } else return this.tryDispatchIterableTable(iterator.head[0]!, c, constraint, force);
  }

  tryDispatchNameConstraint(c: NameConstraint, constraint: Constraint): boolean {
    if (this.isBlocked(c.namedType)) return this.block(c.namedType, constraint);

    const target = follow(c.namedType);

    if (target.persistent || target.owningArena !== this.arena) return true;

    const tf = constraint.scope.lookupType(c.name);
    if (tf) {
      // This checks whether the alias breaks the restriction on recursive uses.
      const signature: InstantiationSignature = { fn: tf, arguments: c.typeParameters, packArguments: c.typePackParameters };

      const itf = new InfiniteTypeFinder(this, signature, constraint.scope);
      itf.run(target);

      if (itf.foundInfiniteType) {
        constraint.scope.invalidTypeAliases.set(c.name, constraint.location);
        if (get(target, "BlockedType") || get(target, "FreeType") || get(target, "PendingExpansionType")) {
          this.bind(constraint, target, this.builtinTypes.errorType);
        }
        return true;
      }
    }

    const ttv = get(target, "TableType");
    if (ttv) {
      if (c.synthetic && ttv.name === undefined) ttv.syntheticName = c.name;
      else {
        ttv.name = c.name;
        ttv.instantiatedTypeParams = [...c.typeParameters];
        ttv.instantiatedTypePackParams = [...c.typePackParameters];
      }
    } else {
      const mtv = get(target, "MetatableType");
      if (mtv) mtv.syntheticName = c.name;
    }

    return true;
  }

  tryDispatchTypeAliasExpansionConstraint(c: TypeAliasExpansionConstraint, constraint: Constraint): boolean {
    const petv = get(follow(c.target), "PendingExpansionType");
    if (!petv) {
      this.unblock(c.target, constraint.location);
      return true;
    }

    const bindResult = (result: TypeId): void => {
      const cTarget = follow(c.target);
      // The occurs check keeps an alias from being bound to itself.
      if (occursCheck(cTarget, result)) {
        this.reportError({ kind: "OccursCheckFailed" }, constraint.location, this.moduleNameOf(constraint));
        this.bind(constraint, cTarget, this.builtinTypes.errorType);
      } else {
        this.bind(constraint, cTarget, result);
      }
    };

    const tf = petv.prefix !== undefined ? constraint.scope.lookupImportedType(petv.prefix, petv.name) : constraint.scope.lookupType(petv.name);

    if (!tf) {
      this.reportError(
        { kind: "UnknownSymbol", name: petv.name, context: UnknownSymbolContext.Type },
        constraint.location,
        this.moduleNameOf(constraint),
      );
      bindResult(this.builtinTypes.errorType);
      return true;
    }

    // While the alias's type is itself blocked, this waits for it. This does not use `isBlocked`, as this constraint
    // handles pending expansions and type function instances specially.
    if (get(follow(tf.type), "BlockedType")) return this.block(tf.type, constraint);

    // A type function instance gets a reduce constraint.
    const tfit = get(follow(tf.type), "TypeFunctionInstanceType");
    if (tfit) {
      let toReduce = follow(tf.type);

      // An instance from another arena, such as one imported from another module, is copied into this arena so that
      // the reducer can mutate it.
      if (toReduce.owningArena !== this.arena) {
        toReduce = this.arena.addType(typeFunctionInstanceType(tfit.function, [...tfit.typeArguments], [...tfit.packArguments], tfit.userFuncName));

        this.pushConstraint(constraint.scope, constraint.location, { kind: "ReduceConstraint", ty: toReduce }, constraint.moduleName);

        if (tf.typeParams.length === 0 && tf.typePackParams.length === 0) {
          bindResult(toReduce);
          return true;
        }
      } else {
        this.pushConstraint(constraint.scope, constraint.location, { kind: "ReduceConstraint", ty: toReduce }, constraint.moduleName);
      }
    }

    // Given how pending expansion types and aliases are made, passing this check means a cyclic, or corecursive,
    // alias of size 0.
    const lhs = follow(c.target);
    const rhs = tf.type;
    if (occursCheck(lhs, rhs)) {
      this.reportError({ kind: "OccursCheckFailed" }, constraint.location, this.moduleNameOf(constraint));
      bindResult(this.builtinTypes.errorType);
      return true;
    }

    // An alias without parameters stands for its type directly.
    if (tf.typeParams.length === 0 && tf.typePackParams.length === 0) {
      bindResult(tf.type);
      return true;
    }

    const [typeArguments, packArguments] = saturateArguments(this.arena, this.builtinTypes, tf, petv.typeArguments, petv.packArguments);

    const sameTypes = typeArguments.length === tf.typeParams.length && typeArguments.every((itp, i) => itp === tf.typeParams[i]!.ty);

    const samePacks = packArguments.length === tf.typePackParams.length && packArguments.every((itp, i) => itp === tf.typePackParams[i]!.tp);

    // Instantiating the alias with its own generics is the identity substitution, which binds straight to the alias's
    // type.
    if (sameTypes && samePacks) {
      bindResult(tf.type);
      return true;
    }

    const signature: InstantiationSignature = { fn: tf, arguments: typeArguments, packArguments };

    // Instantiation is deterministic, so a signature seen before reuses its instantiation.
    const cached = this.instantiatedAliases.get(instantiationSignatureKey(signature));
    if (cached) {
      bindResult(cached);
      return true;
    }

    // To keep infinite types from being expanded forever, the alias's type is scanned for expansions of the same alias
    // with different arguments (see https://github.com/luau-lang/luau/pull/68). This catches an infinite expansion
    // before it is attempted, which is nicer than a recursion limit.
    const itf = new InfiniteTypeFinder(this, signature, constraint.scope);
    itf.run(tf.type);

    if (itf.foundInfiniteType) {
      bindResult(this.builtinTypes.errorType);
      constraint.scope.invalidTypeAliases.set(petv.name, constraint.location);
      return true;
    }

    // This is not quite instantiation, as the arguments also replace the binders: `<T...>(T...) -> T...` instantiated
    // with `any` for `T...` becomes `<any>(any) -> any`, where none of these are generics.
    const applyTypeFunction = new ApplyTypeFunction(this.arena);
    for (let i = 0; i < typeArguments.length; ++i) {
      applyTypeFunction.typeArguments.set(tf.typeParams[i]!.ty, typeArguments[i]!);
    }

    for (let i = 0; i < packArguments.length; ++i) {
      applyTypeFunction.typePackArguments.set(tf.typePackParams[i]!.tp, packArguments[i]!);
    }

    const maybeInstantiated = applyTypeFunction.substitute(tf.type);
    // `encounteredForwardedType` is never set here, as forward-declared generic aliases do not use free types.

    if (!maybeInstantiated) {
      // No error is reported for this.
      bindResult(this.builtinTypes.errorType);
      return true;
    }

    let instantiated: TypeId = maybeInstantiated;
    let target = follow(instantiated);

    // The application is not recursive, so the type function instantiations within the result are queued for it to
    // be complete.
    const queuer = new InstantiationQueuer(constraint.scope, constraint.location, this, constraint.moduleName);

    queuer.run(target);

    // The arguments may hold pending expansion types as well.
    for (const arg of typeArguments) queuer.run(arg);
    for (const arg of packArguments) queuer.runPack(arg);

    if (target.persistent || target.owningArena !== this.arena) {
      bindResult(target);
      return true;
    }

    // Applying an alias gives back the very same type when, for example, some generics go unused.
    const tfTable = getTableType(tf.type);

    const needsClone =
      follow(tf.type) === target || (tfTable !== undefined && tfTable === getTableType(target)) || typeArguments.some((other) => other === target);

    // Only tables have the properties set here.
    let ttv = getTableType(target);

    if (ttv) {
      if (needsClone) {
        if (get(target, "MetatableType")) {
          instantiated = shallowClone(target, this.arena, true);
          const mtv = get(instantiated, "MetatableType")!;
          mtv.table = shallowClone(mtv.table, this.arena, true);
          ttv = get(mtv.table, "TableType")!;
        } else if (get(target, "TableType")) {
          instantiated = shallowClone(target, this.arena, true);
          ttv = get(instantiated, "TableType")!;
        }

        target = follow(instantiated);
      }

      // This is a new type, defined here.
      ttv.definitionLocation = constraint.location;
      ttv.definitionModuleName = this.moduleNameOf(constraint);

      ttv.instantiatedTypeParams = [...typeArguments];
      ttv.instantiatedTypePackParams = [...packArguments];
    }

    bindResult(target);

    this.instantiatedAliases.set(instantiationSignatureKey(signature), target);

    return true;
  }

  /** Binds the discriminant types a call left unused to `*no-refine*`, and unblocks every one of them. */
  fillInDiscriminantTypes(constraint: Constraint, discriminantTypes: (TypeId | undefined)[]): void {
    for (const ty of discriminantTypes) {
      if (!ty) continue;

      // `*no-refine*` marks an unused discriminant as safe to ignore.
      if (this.isBlocked(ty)) emplaceType(follow(ty), boundType(this.builtinTypes.noRefineType));

      // These types are unblocked unconditionally, which keeps "Blocked on *no-refine*" from showing up.
      this.unblock(ty, constraint.location);
    }
  }

  tryDispatchFunctionCallConstraint(c: FunctionCallConstraint, constraint: Constraint): boolean {
    let fn = follow(c.fn);
    let argsPack = followPack(c.argsPack);
    let result = followPack(c.result);

    if (this.isBlocked(fn)) return this.block(c.fn, constraint);

    if (get(fn, "AnyType")) {
      emplaceTypePack(c.result, boundTypePack(this.builtinTypes.anyTypePack));
      this.unblockPack(c.result, constraint.location);
      this.fillInDiscriminantTypes(constraint, c.discriminantTypes);
      return true;
    }

    // Calling an error type gives an error type, and that's that.
    if (get(fn, "ErrorType")) {
      this.bindPack(constraint, c.result, this.builtinTypes.errorTypePack);
      this.fillInDiscriminantTypes(constraint, c.discriminantTypes);
      return true;
    }

    if (get(fn, "NeverType")) {
      this.bindPack(constraint, c.result, this.builtinTypes.neverTypePack);
      this.fillInDiscriminantTypes(constraint, c.discriminantTypes);
      return true;
    }

    const { head: argsHead, tail: argsTail } = flatten(argsPack);

    let blocked = false;
    for (const t of argsHead) {
      if (this.isBlocked(t)) {
        this.block(t, constraint);
        blocked = true;
      }
    }

    if (argsTail && this.isBlockedPack(argsTail)) {
      this.blockPack(argsTail, constraint);
      blocked = true;
    }

    if (blocked) return false;

    const collapse = (t: UnionType | IntersectionType): TypeId | undefined => {
      const members = flatOptions(t);

      if (members.length === 0) return undefined;

      const fst = follow(members[0]!);
      for (const member of members) {
        if (follow(member) !== fst) return undefined;
      }

      return fst;
    };

    // Sometimes `fn` is a union or intersection whose members are all the same type.
    const ut = get(fn, "UnionType");
    if (ut) fn = collapse(ut) ?? fn;
    else {
      const it = get(fn, "IntersectionType");
      if (it) fn = collapse(it) ?? fn;
    }

    let usedMagic = false;

    const ftv = get(fn, "FunctionType");
    if (ftv) {
      if (ftv.magic && c.callSite) {
        usedMagic = ftv.magic.infer({ solver: this, constraint, callSite: c.callSite, arguments: c.argsPack, result });
        ftv.magic.refine?.({ scope: constraint.scope, callSite: c.callSite, discriminantTypes: c.discriminantTypes });
      }
    }

    if (c.typeArguments.length || c.typePackArguments.length) {
      fn = this.instantiateFunctionType(c.fn, c.typeArguments, c.typePackArguments, constraint.scope, constraint.location);
    }

    this.fillInDiscriminantTypes(constraint, c.discriminantTypes);

    const resolver = new OverloadResolver(
      this.builtinTypes,
      this.arena,
      this.normalizer,
      this.typeFunctionRuntime,
      constraint.scope,
      this.limits,
      constraint.location,
    );

    const uniqueTypes = new Set<TypeId>();
    if (c.callSite) findUniqueTypesIn(uniqueTypes, c.callSite.args, c.astTypes!);

    let overloadToUse = fn;

    // A function type needs no overload selection, which would only waste time.
    if (!is(fn, "FunctionType")) {
      const res = resolver.resolveOverload(
        fn,
        argsPack,
        c.callSite ? c.callSite.func.location : new Location(),
        uniqueTypes,
        /* useFreeTypeBounds */ true,
      );

      // Selection is never retried, as that is prohibitively expensive.
      const { overload } = res.getUnambiguousOverload();

      if (overload) {
        overloadToUse = overload;
      } else {
        // Without an unambiguous overload, the result is the error type.
        this.bindPack(constraint, c.result, this.builtinTypes.errorTypePack);
        return true;
      }

      if (res.metamethods.has(overloadToUse)) argsPack = this.arena.addTypePack([fn], argsPack);
    }

    let retTp = this.arena.freshTypePack(constraint.scope, Polarity.Positive);
    trackInteriorFreeTypePack(constraint.scope, retTp);

    const inferredTy = this.arena.addType(functionType(argsPack, retTp));

    const u2 = new Unifier2(this.arena, this.builtinTypes, constraint.scope);

    const unifyResult = u2.unify(overloadToUse, inferredTy);

    for (const freeTy of u2.newFreshTypes) trackInteriorFreeType(constraint.scope, freeTy);
    for (const freeTp of u2.newFreshTypePacks) trackInteriorFreeTypePack(constraint.scope, freeTp);

    if (u2.genericSubstitutions.size || u2.genericPackSubstitutions.size) {
      // Given
      //
      //  local tbl = {}
      //  for _ in 0..3 do
      //      table.insert(tbl, i)
      //  end
      //  return table.unpack(tbl)
      //
      // the constraints of `table.unpack`, of type `<T>({ T }) -> ...T`, may leave `T` without bounds: `tbl` gets an
      // indexer that is never unified with anything. The resolved overload would then be `({ unknown }) -> ...unknown`,
      // which fails type checking, so when no generic has bounds, the resolved overload is not stored (CLI-191965).
      let hasNonTrivialSubstitution = false;
      for (const [, ty] of u2.genericSubstitutions) {
        const ft = get(ty, "FreeType");
        if (ft && (!is(follow(ft.lowerBound), "NeverType") || !is(follow(ft.upperBound), "UnknownType"))) hasNonTrivialSubstitution = true;
      }

      // Generics to bind, with bounds to bind them to:
      const overloadAsFn = get(overloadToUse, "FunctionType");
      if (overloadAsFn && hasNonTrivialSubstitution) {
        // Persistent types are cloned here, for example when instantiating `table.insert`.
        const clonedTy = shallowClone(overloadToUse, this.arena, true);
        const clonedFn = get(clonedTy, "FunctionType")!;
        clonedFn.generics = [];
        clonedFn.genericPacks = [];
        const inst = instantiate2(this.arena, u2.genericSubstitutions, u2.genericPackSubstitutions, this.subtyping, constraint.scope, clonedTy);
        if (inst) {
          const instantiatedFn = get(inst, "FunctionType")!;
          overloadToUse = inst;
          retTp = followPack(instantiatedFn.retTypes);
        } else {
          this.reportError({ kind: "CodeTooComplex" }, constraint.location, this.moduleNameOf(constraint));
          result = this.builtinTypes.errorTypePack;
        }
      } else {
        const newRetTp = getApproximateReturnTypeForFunctionCall(overloadToUse) ?? this.builtinTypes.errorTypePack;

        const subst = instantiate2Pack(this.arena, u2.genericSubstitutions, u2.genericPackSubstitutions, this.subtyping, constraint.scope, newRetTp);

        if (subst) retTp = subst;
        else this.reportError({ kind: "CodeTooComplex" }, constraint.location, this.moduleNameOf(constraint));
      }
    }

    if (!usedMagic) this.bindPack(constraint, c.result, retTp);

    for (const [expanded, additions] of u2.expandedFreeTypes) {
      for (const addition of additions) getOrInsert(this.upperBoundContributors, expanded, () => []).push([constraint.location, addition]);
    }

    switch (unifyResult) {
      case UnifyResult.Ok:
        if (c.callSite) {
          // The way bidirectional inference of function arguments works makes magic functions rely on getting the
          // inferred type here (CLI-192090).
          c.astOverloadResolvedTypes!.set(c.callSite, usedMagic ? inferredTy : overloadToUse);
        }
        break;
      case UnifyResult.TooComplex:
        this.reportError({ kind: "UnificationTooComplex" }, constraint.location, this.moduleNameOf(constraint));
        break;
      case UnifyResult.OccursCheckFailed:
        this.reportError({ kind: "OccursCheckFailed" }, constraint.location, this.moduleNameOf(constraint));
        break;
    }

    const queuer = new InstantiationQueuer(constraint.scope, constraint.location, this, constraint.moduleName);
    queuer.run(overloadToUse);
    queuer.runPack(argsPack);
    queuer.runPack(result);

    return true;
  }

  tryDispatchFunctionCheckConstraint(c: FunctionCheckConstraint, constraint: Constraint, force: boolean): boolean {
    // A function check is never forced.
    force = false;

    const fn = follow(c.fn);
    const argsPack = followPack(c.argsPack);

    if (this.isBlocked(fn)) return this.block(fn, constraint);

    if (this.isBlockedPack(argsPack)) return true;

    // The type of the function and the arguments it expects are known, and so are the types of the arguments it is
    // passed. Bidirectional type checking forces the arguments' types to be the expected ones, and type checking
    // reports anything incoherent. When an argument is a lambda, its unannotated parameters take the expected types
    // too.
    //
    // Overloaded functions get no bidirectional type checking.
    const ftv = get(fn, "FunctionType");
    if (!ftv) return true;

    const replacements = new Map<TypeId, TypeId>();
    const replacementPacks = new Map<TypePackId, TypePackId>();

    const genericTypesAndPacks = new Set<object>();

    const u2 = new Unifier2(this.arena, this.builtinTypes, constraint.scope);

    for (const generic of ftv.generics) {
      // Types other than generics can show up here, for example when checking a recursive function call.
      const gty = get(follow(generic), "GenericType");
      if (gty) {
        replacements.set(generic, gty.polarity === Polarity.Negative ? this.builtinTypes.neverType : this.builtinTypes.unknownType);
        genericTypesAndPacks.add(generic);
      }
    }

    for (const genericPack of ftv.genericPacks) {
      replacementPacks.set(genericPack, this.builtinTypes.unknownTypePack);
      genericTypesAndPacks.add(genericPack);
    }

    const callSite = c.callSite!;

    // A self call has one more type than the call has arguments, and the self type gets no bidirectional inference.
    const typeOffset = callSite.self ? 1 : 0;

    const expectedArgs = extendTypePack(this.arena, this.builtinTypes, ftv.argTypes, callSite.args.length + typeOffset).head;
    const argPackHead = flatten(argsPack).head;

    for (let i = 0; i < callSite.args.length && i + typeOffset < expectedArgs.length && i + typeOffset < argPackHead.length; ++i) {
      const expectedArgTy = follow(expectedArgs[i + typeOffset]!);
      const expr = unwrapGroup(callSite.args[i]!);

      const result = pushTypeInto(c.astTypes, c.astExpectedTypes, this, constraint, genericTypesAndPacks, u2, this.subtyping, expectedArgTy, expr);

      // Given
      //
      //  local Direction = { Left = 1, Right = 2 }
      //  type Direction = keyof<Direction>
      //
      //  local function move(dirs: { Direction }) --[[...]] end
      //
      //  move({ "Left", "Right", "Left", "Right" })
      //
      // `keyof<Direction>` has to reduce before the arguments to `move` generalize to their lower bounds, and these
      // constraints ensure that order.
      if (!force && result.incompleteTypes.length) {
        for (const { expectedType: newExpectedTy, targetType: newTargetTy, expr: newExpr } of result.incompleteTypes) {
          const addition = this.pushConstraint(
            constraint.scope,
            constraint.location,
            {
              kind: "PushTypeConstraint",
              expectedType: newExpectedTy,
              targetType: newTargetTy,
              astTypes: c.astTypes,
              astExpectedTypes: c.astExpectedTypes,
              expr: newExpr,
            },
            constraint.moduleName,
          );
          this.inheritBlocks(constraint, addition);
        }
      }
    }

    // As above, these make sure type functions such as `keyof<Direction>` reduce before the arguments generalize.
    for (const cv of u2.incompleteSubtypes) {
      const addition = this.pushConstraint(constraint.scope, constraint.location, cv, constraint.moduleName);
      this.inheritBlocks(constraint, addition);
    }

    return true;
  }

  tryDispatchHasPropConstraint(c: HasPropConstraint, constraint: Constraint): boolean {
    const subjectType = follow(c.subjectType);
    const resultType = follow(c.resultType);

    if (this.isBlocked(subjectType)) return this.block(subjectType, constraint);

    const subjectTable = getTableType(subjectType);
    if (subjectTable) {
      if (subjectTable.state === TableState.Unsealed && subjectTable.remainingProps > 0 && !subjectTable.props.has(c.prop)) {
        return this.block(subjectType, constraint);
      }
    }

    // It does not matter whether the type came from an indexer.
    const { blockedTypes: blocked, propType: result } = this.lookupTableProp(
      constraint,
      subjectType,
      c.prop,
      c.context,
      c.inConditional,
      c.suppressSimplification,
    );
    if (blocked.length) {
      for (const b of blocked) this.block(b, constraint);

      return false;
    }

    this.bind(constraint, resultType, result ?? this.builtinTypes.anyType);
    return true;
  }

  tryDispatchHasIndexer(
    recursionDepth: { value: number },
    constraint: Constraint,
    subjectType: TypeId,
    indexType: TypeId,
    resultType: TypeId,
    seen: Set<TypeId>,
  ): boolean {
    // Luau's `RecursionLimiter`.
    ++recursionDepth.value;
    try {
      if (SOLVER_RECURSION_LIMIT > 0 && recursionDepth.value > SOLVER_RECURSION_LIMIT) {
        throw new RecursionLimitError("ConstraintSolver::tryDispatchHasIndexer");
      }

      subjectType = follow(subjectType);
      indexType = follow(indexType);

      if (seen.has(subjectType)) return false;
      seen.add(subjectType);

      if (get(subjectType, "AnyType")) {
        this.bind(constraint, resultType, this.builtinTypes.anyType);
        return true;
      }

      const subject = subjectType.ty;
      if (subject.kind === "FreeType") {
        const ft = subject;
        const tbl = get(follow(ft.upperBound), "TableType");
        if (tbl && tbl.indexer) {
          this.unify(constraint, indexType, tbl.indexer.indexType);
          this.bind(constraint, resultType, tbl.indexer.indexResultType);
          return true;
        } else {
          const mt = get(follow(ft.upperBound), "MetatableType");
          if (mt) return this.tryDispatchHasIndexer(recursionDepth, constraint, mt.table, indexType, resultType, seen);
        }

        const freeResult = freshType(this.arena, this.builtinTypes, ft.scope, Polarity.Mixed);
        trackInteriorFreeType(ft.scope, freeResult);
        this.bind(constraint, resultType, freeResult);
        // `resultType` is followed later, so it is simply reassigned here.
        resultType = freeResult;

        const upperBound = this.arena.addType(
          tableType({ indexer: new TableIndexer(indexType, resultType), scope: ft.scope, state: TableState.Unsealed }),
        );

        const sr = follow(this.simplifyIntersection(constraint.scope, constraint.location, ft.upperBound, upperBound));

        if (get(sr, "NeverType")) this.bind(constraint, resultType, this.builtinTypes.errorType);
        else ft.upperBound = sr;

        return true;
      } else if (subject.kind === "TableType") {
        const tt = subject;
        const indexer = tt.indexer;
        if (indexer) {
          this.unify(constraint, indexType, indexer.indexType);
          this.bind(constraint, resultType, indexer.indexResultType);
          return true;
        }

        if (tt.state === TableState.Unsealed) {
          // This is greedy.
          const freeResult = freshType(this.arena, this.builtinTypes, tt.scope, Polarity.Mixed);
          trackInteriorFreeType(tt.scope, freeResult);
          this.bind(constraint, resultType, freeResult);

          tt.indexer = new TableIndexer(indexType, resultType);
          return true;
        }
      } else if (subject.kind === "MetatableType") {
        return this.tryDispatchHasIndexer(recursionDepth, constraint, subject.table, indexType, resultType, seen);
      } else if (subject.kind === "ExternType") {
        const ct = subject;
        const indexer = ct.indexer;
        if (indexer) {
          this.unify(constraint, indexType, indexer.indexType);
          this.bind(constraint, resultType, indexer.indexResultType);
          return true;
        } else if (isString(indexType)) {
          this.bind(constraint, resultType, this.builtinTypes.unknownType);
          return true;
        }
      } else if (subject.kind === "IntersectionType") {
        // Indexing into an intersection is roughly akin to overload selection: the result is the intersection of the
        // results for every part that it is well typed to index into.
        const ib = new IntersectionBuilder(this.arena, this.builtinTypes);
        let success = false;

        for (const part of flatOptions(subject)) {
          let r = this.arena.addType(blockedType());
          setOwner(get(r, "BlockedType")!, constraint);

          const ok = this.tryDispatchHasIndexer(recursionDepth, constraint, part, indexType, r, seen);
          // A recursive loop cut short is skipped.
          if (!ok) continue;

          r = follow(r);
          if (!get(r, "ErrorType")) {
            success = true;
            ib.add(r);
          }
        }

        // The flag tells the empty case, where no part could be indexed, from the bottom type, where one part's
        // result was `never`, which the builder records alone.
        if (success) this.bind(constraint, resultType, ib.build());
        else this.bind(constraint, resultType, this.builtinTypes.errorType);

        return true;
      } else if (subject.kind === "UnionType") {
        // Indexing into a union gives the union of the results, as which member it is is not known.
        const ub = new UnionBuilder(this.arena, this.builtinTypes);
        let success = false;

        for (const option of flatOptions(subject)) {
          let r = this.arena.addType(blockedType());
          setOwner(get(r, "BlockedType")!, constraint);

          const ok = this.tryDispatchHasIndexer(recursionDepth, constraint, option, indexType, r, seen);
          // A recursive loop cut short is skipped.
          if (!ok) continue;

          r = follow(r);
          success = true;
          ub.add(r);
        }

        // The flag tells the empty case, where no member could be indexed, from the top type, where one member's
        // result was `unknown`, which the builder records alone.
        if (success) this.bind(constraint, resultType, ub.build());
        else this.bind(constraint, resultType, this.builtinTypes.errorType);

        return true;
      }

      this.bind(constraint, resultType, this.builtinTypes.errorType);

      return true;
    } finally {
      --recursionDepth.value;
    }
  }

  tryDispatchHasIndexerConstraint(c: HasIndexerConstraint, constraint: Constraint): boolean {
    const subjectType = follow(c.subjectType);
    const indexType = follow(c.indexType);

    if (this.isBlocked(subjectType)) return this.block(subjectType, constraint);

    if (this.isBlocked(indexType)) return this.block(indexType, constraint);

    const btf = new BlockedTypeFinder();

    // `visit` looks at the subject alone without traversing it, so `blocked` stays unset.
    btf.visit(subjectType);

    if (btf.blocked) return this.block(btf.blocked, constraint);
    const recursionDepth = { value: 0 };

    const seen = new Set<TypeId>();

    const result = this.tryDispatchHasIndexer(recursionDepth, constraint, subjectType, indexType, c.resultType, seen);

    // This implies that the graph also needs an edge for having an indexer (CLI-205496).
    if (result) this.unblock(subjectType, new Location());

    return result;
  }

  tryDispatchAssignPropConstraint(c: AssignPropConstraint, constraint: Constraint): boolean {
    let lhsType = follow(c.lhsType);
    const propName = c.propName;
    const rhsType = follow(c.rhsType);

    if (this.isBlocked(lhsType)) return this.block(lhsType, constraint);

    // The cases are:
    // 1. lhsType is an extern type that already has the prop
    // 2. lhsType is a table that already has the prop (or a union or intersection that has the prop in aggregate)
    // 3. lhsType has a metatable that already has the prop
    // 4. lhsType is an unsealed table that does not have the prop, but has a string indexer
    // 5. lhsType is an unsealed table that does not have the prop or a string indexer
    //
    // Every path through this function binds `c.propType` to something, even if it is just the error type.

    const lhsExternType = get(lhsType, "ExternType");
    if (lhsExternType) {
      const prop = lookupExternTypeProp(lhsExternType, propName);
      if (!prop || !prop.writeTy) {
        this.bind(constraint, c.propType, this.builtinTypes.anyType);
        return true;
      }

      this.bind(constraint, c.propType, prop.writeTy);
      this.unify(constraint, rhsType, prop.writeTy);
      return true;
    }

    const lhsFree = get(lhsType, "FreeType");
    if (lhsFree) {
      const lhsFreeUpperBound = follow(lhsFree.upperBound);

      const { blockedTypes: blocked, propType: maybeTy, isIndex } = this.lookupTableProp(constraint, lhsType, propName, ValueContext.LValue);
      if (blocked.length) {
        for (const t of blocked) this.block(t, constraint);
        return false;
      } else if (maybeTy) {
        this.bind(constraint, c.propType, isIndex ? this.arena.addType(unionType([maybeTy, this.builtinTypes.nilType])) : maybeTy);
        this.unify(constraint, rhsType, maybeTy);
        return true;
      } else {
        const newUpperBound = this.arena.addType(tableType({ state: TableState.Free, scope: constraint.scope }));

        trackInteriorFreeType(constraint.scope, newUpperBound);

        const upperTable = get(newUpperBound, "TableType")!;

        upperTable.props.set(c.propName, Property.rw(rhsType));

        // Could this block when simplification meets a blocked type?
        lhsFree.upperBound = this.simplifyIntersection(constraint.scope, constraint.location, lhsFreeUpperBound, newUpperBound);

        this.bind(constraint, c.propType, rhsType);
        return true;
      }
    }

    // A table that already has the property or a matching indexer, which also covers unions and intersections.
    const { blockedTypes: blocked, propType: maybeTy, isIndex } = this.lookupTableProp(constraint, lhsType, propName, ValueContext.LValue);
    if (blocked.length) {
      for (const t of blocked) this.block(t, constraint);
      return false;
    }

    if (maybeTy) {
      const propTy = maybeTy;
      this.bind(constraint, c.propType, isIndex ? this.arena.addType(unionType([propTy, this.builtinTypes.nilType])) : propTy);
      this.unify(constraint, rhsType, propTy);
      return true;
    }

    const lhsMeta = get(lhsType, "MetatableType");
    if (lhsMeta) lhsType = follow(lhsMeta.table);

    // A table without the named property, which may be a table with a string indexer, or an unsealed or free table
    // that can grow.
    const lhsTable = get(lhsType, "TableType");
    if (lhsTable) {
      const prop = lhsTable.props.get(propName);
      if (prop) {
        if (prop.writeTy) {
          this.bind(constraint, c.propType, prop.writeTy);
          this.unify(constraint, rhsType, prop.writeTy);
          return true;
        } else {
          if (lhsTable.state === TableState.Unsealed || lhsTable.state === TableState.Free) {
            prop.writeTy = prop.readTy;
            this.bind(constraint, c.propType, prop.writeTy!);
            this.unify(constraint, rhsType, prop.writeTy!);
            return true;
          } else {
            this.bind(constraint, c.propType, this.builtinTypes.errorType);
            return true;
          }
        }
      }

      if (lhsTable.indexer && maybeString(lhsTable.indexer.indexType)) {
        this.bind(constraint, c.propType, rhsType);
        this.unify(constraint, rhsType, lhsTable.indexer.indexResultType);
        return true;
      }

      if (lhsTable.state === TableState.Unsealed || lhsTable.state === TableState.Free) {
        // Inserting a free type 'a into a table {| |} means that anything that might affect {| |} might also affect 'a.
        this.cgraph.copyDependenciesOf(lhsType, rhsType);
        this.bind(constraint, c.propType, rhsType);
        const newProp = propertyAt(lhsTable.props, propName);
        newProp.readTy = rhsType;
        newProp.writeTy = rhsType;
        newProp.location = c.propLocation;

        if (lhsTable.state === TableState.Unsealed && c.decrementPropCount) {
          lhsTable.remainingProps -= 1;

          // An unsealed table that was blocked on a missing member has to be woken up. In
          //
          //  local T = {}
          //  function T:foo()
          //         return T:bar(5)
          //  end
          //  function T:bar(i)
          //        return i
          //  end
          //
          // `hasProp T "bar"` may be tried and block, and would then never wake up without forcing a constraint.
          this.unblock(lhsType, constraint.location);
        }

        return true;
      }
    }

    this.bind(constraint, c.propType, this.builtinTypes.errorType);

    return true;
  }

  tryDispatchAssignIndexConstraint(c: AssignIndexConstraint, constraint: Constraint): boolean {
    const lhsType = follow(c.lhsType);
    const indexType = follow(c.indexType);
    const rhsType = follow(c.rhsType);

    if (this.isBlocked(lhsType)) return this.block(lhsType, constraint);

    // The cases are:
    // 0. lhsType could be an intersection or union.
    // 1. lhsType is an extern type with an indexer
    // 2. lhsType is a table with an indexer, or it has a metatable that has an indexer
    // 3. lhsType is a free or unsealed table and can grow an indexer
    //
    // Every path through this function binds `c.propType` to something, even if it is just the error type.

    const tableStuff = (lhsTable: TableType): boolean | undefined => {
      if (lhsTable.indexer) {
        this.unify(constraint, indexType, lhsTable.indexer.indexType);
        this.unify(constraint, rhsType, lhsTable.indexer.indexResultType);
        this.bind(constraint, c.propType, addUnion(this.arena, this.builtinTypes, [lhsTable.indexer.indexResultType, this.builtinTypes.nilType]));
        return true;
      }

      if (lhsTable.state === TableState.Unsealed || lhsTable.state === TableState.Free) {
        lhsTable.indexer = new TableIndexer(indexType, rhsType);
        this.bind(constraint, c.propType, rhsType);
        return true;
      }

      return undefined;
    };

    const lhsFree = get(lhsType, "FreeType");
    if (lhsFree) {
      const lhsTable = get(follow(lhsFree.upperBound), "TableType");
      if (lhsTable) {
        const res = tableStuff(lhsTable);
        if (res !== undefined) return res;
      }

      const newUpperBound = this.arena.addType(
        tableType({ indexer: new TableIndexer(indexType, rhsType), scope: constraint.scope, state: TableState.Free }),
      );
      const newTable = get(newUpperBound, "TableType")!;

      this.unify(constraint, lhsType, newUpperBound);

      this.bind(constraint, c.propType, newTable.indexer!.indexResultType);
      return true;
    }

    const lhsTable = get(lhsType, "TableType");
    if (lhsTable) {
      const res = tableStuff(lhsTable);
      if (res !== undefined) return res;
    }

    let lhsExternType = get(lhsType, "ExternType");
    if (lhsExternType) {
      for (;;) {
        if (lhsExternType.indexer) {
          this.unify(constraint, indexType, lhsExternType.indexer.indexType);
          this.unify(constraint, rhsType, lhsExternType.indexer.indexResultType);
          this.bind(constraint, c.propType, this.arena.addType(unionType([lhsExternType.indexer.indexResultType, this.builtinTypes.nilType])));
          return true;
        }

        if (lhsExternType.parent) lhsExternType = get(lhsExternType.parent, "ExternType")!;
        else break;
      }
      return true;
    }

    const lhsIntersection = get(lhsType, "IntersectionType");
    if (lhsIntersection) {
      const parts = new TypeIds();

      for (const t of flatOptions(lhsIntersection)) {
        const tbl = get(follow(t), "TableType");
        if (tbl) {
          if (tbl.indexer) {
            this.unify(constraint, indexType, tbl.indexer.indexType);
            parts.insert(tbl.indexer.indexResultType);
          }

          if (tbl.state === TableState.Unsealed || tbl.state === TableState.Free) {
            tbl.indexer = new TableIndexer(indexType, rhsType);
            parts.insert(rhsType);
          }
        } else {
          let cls = get(follow(t), "ExternType");
          if (cls) {
            for (;;) {
              if (cls.indexer) {
                this.unify(constraint, indexType, cls.indexer.indexType);
                parts.insert(cls.indexer.indexResultType);
                break;
              }

              if (cls.parent) cls = get(cls.parent, "ExternType")!;
              else break;
            }
          }
        }
      }

      const res = this.simplifyIntersectionOf(constraint.scope, constraint.location, parts);

      this.unify(constraint, rhsType, res);
    }

    // Other types do not support index assignment.
    this.bind(constraint, c.propType, this.builtinTypes.errorType);

    return true;
  }

  tryDispatchUnpackConstraint(c: UnpackConstraint, constraint: Constraint): boolean {
    const sourcePack = followPack(c.sourcePack);

    if (this.isBlockedPack(sourcePack)) return this.blockPack(sourcePack, constraint);

    const srcPack = extendTypePack(this.arena, this.builtinTypes, sourcePack, c.resultPack.length);

    let resultIter = 0;
    const resultEnd = c.resultPack.length;

    let i = 0;
    while (resultIter !== resultEnd) {
      if (i >= srcPack.head.length) break;

      const srcTy = follow(srcPack.head[i]!);
      const resultTy = follow(c.resultPack[resultIter]!);

      if (get(resultTy, "BlockedType")) {
        if (follow(srcTy) === resultTy) {
          // A blocked type that turns out to be blocked only on itself constrains nothing, so it becomes a free type.
          // Whether positive is the right polarity for it is an open question.
          const f = freshType(this.arena, this.builtinTypes, constraint.scope, Polarity.Positive);
          trackInteriorFreeType(constraint.scope, f);
          this.bind(constraint, resultTy, f);
        } else this.bind(constraint, resultTy, srcTy);
      } else this.unify(constraint, srcTy, resultTy);

      ++resultIter;
      ++i;
    }

    // The result pack has no tail, but the source pack may be too short to fill every value: the remaining results
    // become `nil`.
    while (resultIter !== resultEnd) {
      const resultTy = follow(c.resultPack[resultIter]!);
      if (get(resultTy, "BlockedType") || get(resultTy, "PendingExpansionType")) {
        this.bind(constraint, resultTy, this.builtinTypes.nilType);
      }

      ++resultIter;
    }

    return true;
  }

  tryDispatchReduceConstraint(c: ReduceConstraint, constraint: Constraint, force: boolean): boolean {
    let ty = follow(c.ty);

    const context = TypeFunctionContext.fromSolver(this, constraint.scope, constraint, this.subtyping);
    const result = reduceTypeFunctions(ty, constraint.location, context, force);

    for (const r of result.reducedTypes) this.unblock(r, constraint.location);

    for (const r of result.reducedPacks) this.unblockPack(r, constraint.location);

    for (const ity of result.irreducibleTypes) {
      this.uninhabitedTypeFunctions.add(ity);
      this.unblock(ity, constraint.location);
    }

    const reductionFinished = result.blockedTypes.size === 0 && result.blockedPacks.size === 0;

    ty = follow(ty);

    // A type function that could not be reduced goes in the set to finalize.
    if (get(ty, "TypeFunctionInstanceType") && !result.irreducibleTypes.has(ty)) this.typeFunctionsToFinalize.set(ty, constraint);

    if (force || reductionFinished) {
      for (const message of result.messages) this.reportError(message.data, message.location, this.moduleNameOf(constraint));

      // Dispatching this constraint for good records the uninhabited type functions to unblock.
      for (const error of result.errors) {
        if (error.data.kind === "UninhabitedTypeFunction") this.uninhabitedTypeFunctions.add(error.data.ty);
        else if (error.data.kind === "UninhabitedTypePackFunction") this.uninhabitedTypeFunctions.add(error.data.tp);
      }
    }

    if (force) return true;

    for (const b of result.blockedTypes) this.block(b, constraint);

    for (const b of result.blockedPacks) this.blockPack(b, constraint);

    return reductionFinished;
  }

  tryDispatchReducePackConstraint(c: ReducePackConstraint, constraint: Constraint, force: boolean): boolean {
    // A reduce pack constraint is never forced.
    force = false;

    const tp = followPack(c.tp);

    const context = TypeFunctionContext.fromSolver(this, constraint.scope, constraint, this.subtyping);
    const result = reduceTypeFunctionsPack(tp, constraint.location, context, force);

    for (const r of result.reducedTypes) this.unblock(r, constraint.location);

    for (const r of result.reducedPacks) this.unblockPack(r, constraint.location);

    const reductionFinished = result.blockedTypes.size === 0 && result.blockedPacks.size === 0;

    if (force || reductionFinished) {
      // Dispatching this constraint for good records the uninhabited type functions to unblock.
      for (const error of result.errors) {
        if (error.data.kind === "UninhabitedTypeFunction") this.uninhabitedTypeFunctions.add(error.data.ty);
        else if (error.data.kind === "UninhabitedTypePackFunction") this.uninhabitedTypeFunctions.add(error.data.tp);
      }
    }

    if (force) return true;

    for (const b of result.blockedTypes) this.block(b, constraint);

    for (const b of result.blockedPacks) this.blockPack(b, constraint);

    return reductionFinished;
  }

  tryDispatchEqualityConstraint(c: EqualityConstraint, constraint: Constraint): boolean {
    this.unify(constraint, c.resultType, c.assignmentType);
    this.unify(constraint, c.assignmentType, c.resultType);
    return true;
  }

  tryDispatchSimplifyConstraint(c: SimplifyConstraint, constraint: Constraint, force: boolean): boolean {
    const target = follow(c.ty);

    if (target.persistent || target.owningArena !== this.arena || !is(target, "UnionType")) {
      // A persistent union like `false?`, a union from another arena, or something other than a union makes firing
      // this constraint either harmful or useless, so it exits early.
      return true;
    }

    const finder = new FindAllUnionMembers();
    finder.traverse(target);
    if (!finder.blockedTys.empty() && !force) {
      for (const ty of finder.blockedTys) this.block(ty, constraint);
      return false;
    }
    let result = this.builtinTypes.neverType;
    for (let ty of finder.recordedTys) {
      ty = follow(ty);
      if (ty === target) continue;
      result = this.simplifyUnion(constraint.scope, constraint.location, result, ty);
    }
    // A forced constraint may have blocked types, which join the union as well.
    for (let ty of finder.blockedTys) {
      ty = follow(ty);
      if (ty === target) continue;
      result = this.simplifyUnion(constraint.scope, constraint.location, result, ty);
    }
    emplaceType(target, boundType(result));
    // This is one of the few places where the solver rewrites a type it does not claim to be able to mutate.
    // `shiftReferences` is public in Luau's `ConstraintGraph`.
    this.cgraph["shiftReferences"](target, result);
    return true;
  }

  tryDispatchPushFunctionTypeConstraint(c: PushFunctionTypeConstraint, constraint: Constraint): boolean {
    // This could probably share the logic of `FunctionCheckConstraint`, but that constraint does a few other things.

    let expectedFn = get(follow(c.expectedFunctionType), "FunctionType");
    const fn = get(follow(c.functionType), "FunctionType");

    // Unless both the expected type and the given type are functions, there is nothing to do.
    if (!expectedFn || !fn) return true;

    const instantiated = instantiate(this.builtinTypes, this.arena, this.limits, constraint.scope, c.expectedFunctionType);
    if (instantiated) {
      // A function type instantiates to a function type.
      expectedFn = get(instantiated, "FunctionType")!;
    } else {
      // A failed instantiation leaves nothing to do.
      return true;
    }

    const expectedParamTypes = flatten(expectedFn.argTypes).head;
    const paramTypes = flatten(fn.argTypes).head;
    let expectedParams = 0;
    let params = 0;

    if (expectedParams === expectedParamTypes.length || params === paramTypes.length) return true;

    if (c.isSelf) {
      if (is(follow(paramTypes[params]!), "FreeType")) {
        this.bind(constraint, paramTypes[params]!, expectedParamTypes[expectedParams]!);
      }
      expectedParams++;
      params++;
    }

    // `idx` indexes the arguments of the `AstExprFunction`, so a `self` type does not advance it.
    let idx = 0;
    while (idx < c.expr.args.length && expectedParams !== expectedParamTypes.length && params !== paramTypes.length) {
      // Annotations are respected above all else, and a type other than a free type is unexpected; either leaves the
      // parameter alone.
      if (!c.expr.args[idx]!.annotation && get(paramTypes[params]!, "FreeType")) {
        this.bind(constraint, paramTypes[params]!, expectedParamTypes[expectedParams]!);
      }

      expectedParams++;
      params++;
      idx++;
    }

    if (!c.expr.returnAnnotation && getPack(fn.retTypes, "FreeTypePack")) this.bindPack(constraint, fn.retTypes, expectedFn.retTypes);

    return true;
  }

  tryDispatchTypeInstantiationConstraint(c: TypeInstantiationConstraint, constraint: Constraint): boolean {
    if (this.isBlocked(c.functionType)) return this.block(c.functionType, constraint);

    this.bind(
      constraint,
      c.placeholderType,
      this.instantiateFunctionType(c.functionType, c.typeArguments, c.typePackArguments, constraint.scope, constraint.location),
    );

    return true;
  }

  /**
   * Instantiates a function type with explicit type arguments. Generics left without an argument become free types,
   * while generic packs left without one stay generic.
   */
  instantiateFunctionType(
    functionTypeId: TypeId,
    typeArguments: TypeId[],
    typePackArguments: TypePackId[],
    scope: Scope,
    _location: Location,
  ): TypeId {
    functionTypeId = follow(functionTypeId);

    // Without arguments there is nothing to do.
    if (typeArguments.length === 0 && typePackArguments.length === 0) return functionTypeId;

    const ft = get(functionTypeId, "FunctionType");
    if (!ft) {
      return functionTypeId;
    }

    const replacements = new Map<TypeId, TypeId>();
    let typeParametersIter = 0;

    for (const typeArgument of typeArguments) {
      if (typeParametersIter === ft.generics.length) {
        break;
      }

      replacements.set(ft.generics[typeParametersIter++]!, typeArgument);
    }

    while (typeParametersIter !== ft.generics.length) {
      replacements.set(ft.generics[typeParametersIter++]!, freshType(this.arena, this.builtinTypes, scope, Polarity.Mixed));
    }

    const replacementPacks = new Map<TypePackId, TypePackId>();
    let typePackParametersIter = 0;

    for (const typePackArgument of typePackArguments) {
      if (typePackParametersIter === ft.genericPacks.length) {
        break;
      }

      replacementPacks.set(ft.genericPacks[typePackParametersIter++]!, typePackArgument);
    }

    const r = new Replacer(this.arena, replacements, replacementPacks);

    // Persistent types are cloned here so that generic builtins like `table.find` can be instantiated; otherwise, the
    // lines after would corrupt the definition of the original function.
    const clonedFunctionTypeId = shallowClone(functionTypeId, this.arena, /* clonePersistentTypes */ true);
    const ft2 = get(clonedFunctionTypeId, "FunctionType")!;

    // Every generic is instantiated, with a free type where no argument is given.
    ft2.generics = [];

    // Only as many generic packs are instantiated as there are pack arguments.
    if (ft2.genericPacks.length && typePackArguments.length < ft2.genericPacks.length) {
      ft2.genericPacks = ft2.genericPacks.slice(typePackArguments.length);
    } else {
      ft2.genericPacks = [];
    }

    const result = r.substitute(clonedFunctionTypeId);
    if (!result) return this.builtinTypes.errorType;
    return result;
  }

  tryDispatchPushTypeConstraint(c: PushTypeConstraint, constraint: Constraint, force: boolean): boolean {
    // A push type constraint is never forced.
    force = false;

    const u2 = new Unifier2(this.arena, this.builtinTypes, constraint.scope, this.uninhabitedTypeFunctions);

    // Without this check up front, push type constraints start multiplying almost at once.
    if (this.isBlocked(c.expectedType)) {
      this.block(c.expectedType, constraint);
      // A forced constraint with a blocked expected type just gives up.
      return force;
    }

    const empty = new Set<object>();
    const result = pushTypeInto(c.astTypes, c.astExpectedTypes, this, constraint, empty, u2, this.subtyping, c.expectedType, c.expr);

    // A forced constraint exits early, so that inference can go on with the rest of the file, at the risk of errors
    // that should not be there.
    if (force || result.incompleteTypes.length === 0) return true;

    for (const { expectedType: newExpectedTy, targetType: newTargetTy, expr: newExpr } of result.incompleteTypes) {
      const addition = this.pushConstraint(
        constraint.scope,
        constraint.location,
        {
          kind: "PushTypeConstraint",
          expectedType: newExpectedTy,
          targetType: newTargetTy,
          astTypes: c.astTypes,
          astExpectedTypes: c.astExpectedTypes,
          expr: newExpr,
        },
        constraint.moduleName,
      );
      this.inheritBlocks(constraint, addition);
    }

    return true;
  }

  /** Dispatches an iterable constraint over a table, which may have an `__iter` metamethod (`for a, ... in t do`). */
  tryDispatchIterableTable(iteratorTy: TypeId, c: IterableConstraint, constraint: Constraint, force: boolean): boolean {
    // An iterable constraint is never forced.
    force = false;

    iteratorTy = follow(iteratorTy);

    if (get(iteratorTy, "FreeType")) {
      const keyTy = freshType(this.arena, this.builtinTypes, constraint.scope, Polarity.Mixed);
      const valueTy = freshType(this.arena, this.builtinTypes, constraint.scope, Polarity.Mixed);
      trackInteriorFreeType(constraint.scope, keyTy);
      trackInteriorFreeType(constraint.scope, valueTy);
      const tableTy = this.arena.addType(tableType({ state: TableState.Sealed, scope: constraint.scope }));
      get(tableTy, "TableType")!.indexer = new TableIndexer(keyTy, valueTy);

      this.pushConstraint(
        constraint.scope,
        constraint.location,
        { kind: "SubtypeConstraint", subType: iteratorTy, superType: tableTy },
        constraint.moduleName,
      );

      let it = 0;
      const endIt = c.variables.length;
      if (it !== endIt) {
        this.bind(constraint, c.variables[it]!, keyTy);
        ++it;
      }
      if (it !== endIt) this.bind(constraint, c.variables[it]!, valueTy);

      return true;
    }

    const unpack = (ty: TypeId): void => {
      for (const varTy of c.variables) this.bind(constraint, varTy, ty);
    };

    if (get(iteratorTy, "AnyType")) {
      unpack(this.builtinTypes.anyType);
      return true;
    }

    if (get(iteratorTy, "ErrorType")) {
      unpack(this.builtinTypes.errorType);
      return true;
    }

    if (get(iteratorTy, "NeverType")) {
      unpack(this.builtinTypes.neverType);
      return true;
    }

    // Nothing guarantees that this table type never has a metatable.

    const iteratorTable = get(iteratorTy, "TableType");
    if (iteratorTable) {
      // An iterable constraint over a free table waits, as other constraints on the table may make clearer what to do.
      // Iteration should eventually get a type function of its own.
      if (iteratorTable.state === TableState.Free && !force) return this.block(iteratorTy, constraint);

      if (iteratorTable.indexer) {
        // The indexer's result type goes through a reduce constraint on its refinement by `~nil`, as it cannot be nil.
        const intersectionWithNotNil = this.arena.addTypeFunction(this.builtinTypes.typeFunctions.refineFunc, [
          iteratorTable.indexer.indexResultType,
          this.builtinTypes.notNilType,
        ]);

        this.pushConstraint(constraint.scope, constraint.location, { kind: "ReduceConstraint", ty: intersectionWithNotNil }, constraint.moduleName);

        const expectedVariables: TypeId[] = [iteratorTable.indexer.indexType, intersectionWithNotNil];

        while (c.variables.length >= expectedVariables.length) expectedVariables.push(this.builtinTypes.errorType);

        for (let i = 0; i < c.variables.length; ++i) {
          this.unify(constraint, c.variables[i]!, expectedVariables[i]!);

          this.bind(constraint, c.variables[i]!, expectedVariables[i]!);
        }
      } else unpack(this.builtinTypes.errorType);
    } else {
      const iterFn = findMetatableEntry(this.builtinTypes, this.errors, iteratorTy, "__iter", new Location());
      if (iterFn) {
        if (this.isBlocked(iterFn)) {
          return this.block(iterFn, constraint);
        }

        const instantiatedIterFn = instantiate(this.builtinTypes, this.arena, this.limits, constraint.scope, iterFn);
        if (instantiatedIterFn) {
          const iterFtv = get(instantiatedIterFn, "FunctionType");
          if (iterFtv) {
            const expectedIterArgs = this.arena.addTypePack([iteratorTy]);
            this.unifyPack(constraint, iterFtv.argTypes, expectedIterArgs);

            const iterRets = extendTypePack(this.arena, this.builtinTypes, iterFtv.retTypes, 2);

            if (iterRets.head.length < 1) {
              // This is as far as the solver goes; the type checker reports the error.
              return true;
            }

            const nextFn = iterRets.head[0]!;

            const instantiatedNextFn = instantiate(this.builtinTypes, this.arena, this.limits, constraint.scope, nextFn);
            if (instantiatedNextFn) {
              const nextFnTy = get(instantiatedNextFn, "FunctionType");

              // Without a function type, the iterator function has an improper signature.
              if (nextFnTy) this.unpackAndAssign(c.variables, nextFnTy.retTypes, constraint);

              return true;
            } else {
              this.reportError({ kind: "UnificationTooComplex" }, constraint.location, this.moduleNameOf(constraint));
            }
          }
          // An `__iter` that is a table with `__call`, or an overloaded function, is not supported.
        } else {
          this.reportError({ kind: "UnificationTooComplex" }, constraint.location, this.moduleNameOf(constraint));
        }
      } else {
        const iteratorMetatable = get(iteratorTy, "MetatableType");
        if (iteratorMetatable) {
          // Without an `__iter` metamethod, the table part of the metatable type is iterated over.
          return this.tryDispatchIterableTable(iteratorMetatable.table, c, constraint, force);
        } else {
          const primitiveTy = get(iteratorTy, "PrimitiveType");
          if (primitiveTy && primitiveTy.type === PrimitiveKind.Table) unpack(this.builtinTypes.unknownType);
          else {
            unpack(this.builtinTypes.errorType);
          }
        }
      }
    }

    return true;
  }

  /** Dispatches an iterable constraint over a next function (`for a, ... in next_function, t, ... do`). */
  tryDispatchIterableFunction(nextTy: TypeId, tableTy: TypeId, c: IterableConstraint, constraint: Constraint): boolean {
    // The type of `nextAstFragment` is `nextTy`.
    c.astForInNextTypes!.set(c.nextAstFragment!, nextTy);

    // A function call constraint tells the types of the loop variables that this iteration assigns to.
    const tableTyPack = this.arena.addTypePack([tableTy]);

    const variablesPack = this.arena.addTypePack(blockedTypePack());

    const callConstraint = this.pushConstraint(
      constraint.scope,
      constraint.location,
      {
        kind: "FunctionCallConstraint",
        fn: nextTy,
        argsPack: tableTyPack,
        result: variablesPack,
        callSite: undefined,
        discriminantTypes: [],
        typeArguments: [],
        typePackArguments: [],
        astTypes: undefined,
        astOverloadResolvedTypes: undefined,
      },
      constraint.moduleName,
    );

    getPack(variablesPack, "BlockedTypePack")!.owner = callConstraint;

    const unpackConstraint = this.unpackAndAssign(c.variables, variablesPack, constraint);

    this.inheritBlocks(constraint, callConstraint);

    this.inheritBlocks(unpackConstraint, callConstraint);
    return true;
  }

  /**
   * Pushes a constraint that unpacks the types of `srcTypes` and assigns each to the corresponding blocked type in
   * `destTypes`, and makes that constraint the owner of those blocked types. Only the decomposition of an iterable
   * constraint uses this, which makes replacing the owners safe. Returns the unpack constraint, as iteration passes
   * blocks on to it.
   */
  unpackAndAssign(destTypes: TypeId[], srcTypes: TypePackId, constraint: Constraint): Constraint {
    const c = this.pushConstraint(
      constraint.scope,
      constraint.location,
      { kind: "UnpackConstraint", resultPack: [...destTypes], sourcePack: srcTypes },
      constraint.moduleName,
    );

    for (const t of destTypes) {
      const bt = get(t, "BlockedType")!;
      bt.owner = c;
    }

    return c;
  }

  /**
   * Looks up a property of a type for reading or for writing. The lookup widens free types and free tables to have
   * the property, and goes through `__index` for a metatable type.
   */
  lookupTableProp(
    constraint: Constraint,
    subjectType: TypeId,
    propName: string,
    context: ValueContext,
    inConditional = false,
    suppressSimplification = false,
    seen: Set<TypeId> = new Set(),
  ): TablePropLookupResult {
    if (seen.has(subjectType)) return lookupResult([], undefined);

    // Luau's `ScopedSeenSet`: the subject as given counts as seen until this lookup returns.
    const seenKey = subjectType;
    seen.add(seenKey);
    try {
      subjectType = follow(subjectType);
      const subject = subjectType.ty;

      if (this.isBlocked(subjectType)) return lookupResult([subjectType], undefined);
      else if (get(subjectType, "AnyType") || get(subjectType, "NeverType") || get(subjectType, "ErrorType")) {
        return lookupResult([], subjectType);
      } else if (subject.kind === "TableType") {
        const ttv = subject;
        const prop = ttv.props.get(propName);
        if (prop) {
          switch (context) {
            case ValueContext.RValue:
              if (prop.readTy) return lookupResult([], prop.readTy);
              break;
            case ValueContext.LValue:
              if (prop.writeTy) return lookupResult([], prop.writeTy);
              break;
          }
        }

        if (ttv.indexer) {
          if (this.isBlocked(ttv.indexer.indexType)) return lookupResult([ttv.indexer.indexType], undefined, true);

          // This needs the same logic as `index<_, _>` (CLI-169235).
          const fauxLiteral = this.arena.addType(stringSingleton(propName));
          if (fastIsSubtype(fauxLiteral, ttv.indexer.indexType)) return lookupResult([], ttv.indexer.indexResultType, /* isIndex */ true);
        }

        if (ttv.state === TableState.Free) {
          const result = freshType(this.arena, this.builtinTypes, ttv.scope, Polarity.Mixed);
          trackInteriorFreeType(ttv.scope, result);
          switch (context) {
            case ValueContext.RValue:
              propertyAt(ttv.props, propName).readTy = result;
              break;
            case ValueContext.LValue: {
              const it = ttv.props.get(propName);
              if (it && it.isReadOnly()) {
                // Read-only properties are inferred, but separate read and write types are not: a write sensed to a
                // read-only property of a free table makes the property read-write, with its read type for both.
                it.writeTy = it.readTy;
                return lookupResult([], it.readTy!);
              } else ttv.props.set(propName, Property.rw(result));

              break;
            }
          }
          return lookupResult([], result);
        }

        // In a conditional context the property counts as present and `unknown`, as the table may be refined to
        // include it. This only applies because tables are inexact, and wants revisiting once Luau has exact tables.
        if (inConditional) return lookupResult([], this.builtinTypes.unknownType);
      } else if (subject.kind === "MetatableType" && context === ValueContext.LValue) {
        // `__newindex` is not considered (CLI-199848).
        return this.lookupTableProp(constraint, subject.table, propName, context, inConditional, suppressSimplification, seen);
      } else if (subject.kind === "MetatableType" && context === ValueContext.RValue) {
        const mt = subject;
        const result = this.lookupTableProp(constraint, mt.table, propName, context, inConditional, suppressSimplification, seen);
        if (result.blockedTypes.length || result.propType) return result;

        const mtt = follow(mt.metatable);

        if (get(mtt, "BlockedType")) return lookupResult([mtt], undefined);
        else {
          const metatable = get(mtt, "TableType");
          if (metatable) {
            const indexProp = metatable.props.get("__index");
            if (!indexProp) return lookupResult([], result.propType);

            // An overloaded `__index` function is not handled.

            // A write-only property cannot be read from.
            if (indexProp.isWriteOnly()) return lookupResult([], this.builtinTypes.errorType);

            const indexType = follow(indexProp.readTy!);

            const ft = get(indexType, "FunctionType");
            if (ft) {
              const rets = extendTypePack(this.arena, this.builtinTypes, ft.retTypes, 1);
              if (1 === rets.head.length) return lookupResult([], rets.head[0]!);
              else {
                // This should probably be an error: the first result of `__index` is needed, but it returns no values
                // (CLI-68672).
                return lookupResult([], this.builtinTypes.nilType);
              }
            } else return this.lookupTableProp(constraint, indexType, propName, context, inConditional, suppressSimplification, seen);
          } else if (get(mtt, "MetatableType")) {
            return this.lookupTableProp(constraint, mtt, propName, context, inConditional, suppressSimplification, seen);
          }
        }
      } else if (subject.kind === "ExternType") {
        const ct = subject;
        const p = lookupExternTypeProp(ct, propName);
        if (p) return lookupResult([], context === ValueContext.RValue ? p.readTy : p.writeTy);

        if (ct.indexer) {
          return lookupResult([], ct.indexer.indexResultType, /* isIndex */ true);
        }
      } else if (subject.kind === "PrimitiveType" && subject.metatable) {
        const metatable = get(follow(subject.metatable), "TableType")!;

        const indexProp = metatable.props.get("__index");
        if (!indexProp) return lookupResult([], undefined);

        // A write-only property cannot be read from.
        if (indexProp.isWriteOnly()) return lookupResult([], this.builtinTypes.errorType);

        return this.lookupTableProp(constraint, indexProp.readTy!, propName, context, inConditional, suppressSimplification, seen);
      } else if (subject.kind === "FreeType") {
        const ft = subject;
        const upperBound = follow(ft.upperBound);

        if (get(upperBound, "TableType") || get(upperBound, "PrimitiveType")) {
          const res = this.lookupTableProp(constraint, upperBound, propName, context, inConditional, suppressSimplification, seen);
          // The property type is missing when the bound is a sealed table or a primitive without the property; the
          // upper bound still gains the property then.
          if (res.propType) return res;
        }

        const scope = ft.scope!;

        const newUpperBound = this.arena.addType(tableType({ state: TableState.Free, scope }));

        trackInteriorFreeType(constraint.scope, newUpperBound);

        const tt = get(newUpperBound, "TableType")!;
        const propType = freshType(this.arena, this.builtinTypes, scope, Polarity.Mixed);
        trackInteriorFreeType(scope, propType);

        switch (context) {
          case ValueContext.RValue:
            tt.props.set(propName, Property.readonly(propType));
            break;
          case ValueContext.LValue:
            tt.props.set(propName, Property.rw(propType));
            break;
        }

        this.unify(constraint, subjectType, newUpperBound);

        return lookupResult([], propType);
      } else if (subject.kind === "UnionType") {
        const blocked: TypeId[] = [];
        const options = new Set<TypeId>();

        for (const ty of flatOptions(subject)) {
          const result = this.lookupTableProp(constraint, ty, propName, context, inConditional, suppressSimplification, seen);
          blocked.push(...result.blockedTypes);
          if (result.propType) options.add(result.propType);
        }

        if (blocked.length) return lookupResult(blocked, undefined);

        // The options are in creation order, as Luau's `std::set` orders them by address.
        const sortedOptions = [...options].sort(bySerial);

        if (sortedOptions.length === 0) return lookupResult([], undefined);
        else if (sortedOptions.length === 1) return lookupResult([], sortedOptions[0]!);
        else if (sortedOptions.length === 2 && !suppressSimplification) {
          const one = sortedOptions[0]!;
          const two = sortedOptions[1]!;

          // An lvalue context needs the common type here.
          if (context === ValueContext.LValue) return lookupResult([], this.simplifyIntersection(constraint.scope, constraint.location, one, two));

          return lookupResult([], this.simplifyUnion(constraint.scope, constraint.location, one, two));
        }
        // An lvalue context needs the common type here.
        else if (context === ValueContext.LValue) return lookupResult([], this.arena.addType(intersectionType(sortedOptions)));
        else return lookupResult([], this.arena.addType(unionType(sortedOptions)));
      } else if (subject.kind === "IntersectionType") {
        const blocked: TypeId[] = [];
        const options = new Set<TypeId>();

        for (const ty of flatOptions(subject)) {
          const result = this.lookupTableProp(constraint, ty, propName, context, inConditional, suppressSimplification, seen);
          blocked.push(...result.blockedTypes);
          if (result.propType) options.add(result.propType);
        }

        if (blocked.length) return lookupResult(blocked, undefined);

        // The options are in creation order, as Luau's `std::set` orders them by address.
        const sortedOptions = [...options].sort(bySerial);

        if (sortedOptions.length === 0) return lookupResult([], undefined);
        else if (sortedOptions.length === 1) return lookupResult([], sortedOptions[0]!);
        else if (sortedOptions.length === 2 && !suppressSimplification) {
          const one = sortedOptions[0]!;
          const two = sortedOptions[1]!;
          return lookupResult([], this.simplifyIntersection(constraint.scope, constraint.location, one, two));
        } else return lookupResult([], this.arena.addType(intersectionType(sortedOptions)));
      } else if (subject.kind === "PrimitiveType") {
        // In a conditional context the property counts as present and `unknown`, as the table may be refined to
        // include it. This only applies because tables are inexact, and wants revisiting once Luau has exact tables.
        if (inConditional && subject.type === PrimitiveKind.Table) return lookupResult([], this.builtinTypes.unknownType);
      }

      return lookupResult([], undefined);
    } finally {
      seen.delete(seenKey);
    }
  }

  /**
   * Unifies `subTy` with `superTy`. The subtype constraints that unification leaves undecided are pushed, and block
   * whatever this constraint blocks. Returns false when unification failed its occurs check or was too complex.
   */
  unify(constraint: Constraint, subTy: TypeId, superTy: TypeId): boolean {
    const u2 = new Unifier2(this.arena, this.builtinTypes, constraint.scope, this.uninhabitedTypeFunctions);
    const result = u2.unify(subTy, superTy);
    return this.finishUnification(constraint, u2, result);
  }

  unifyPack(constraint: Constraint, subTp: TypePackId, superTp: TypePackId): boolean {
    const u2 = new Unifier2(this.arena, this.builtinTypes, constraint.scope, this.uninhabitedTypeFunctions);
    const result = u2.unifyPack(subTp, superTp);
    return this.finishUnification(constraint, u2, result);
  }

  /** The rest of `unify` and `unifyPack`, once the unifier has run. */
  private finishUnification(constraint: Constraint, u2: Unifier2, result: UnifyResult): boolean {
    for (const cv of u2.incompleteSubtypes) {
      this.inheritBlocks(constraint, this.pushConstraint(constraint.scope, constraint.location, cv, constraint.moduleName));
    }

    for (const [ty, newUpperBounds] of u2.expandedFreeTypes) {
      const upperBounds = getOrInsert(this.upperBoundContributors, ty, () => []);
      for (const newUpperBound of newUpperBounds) upperBounds.push([constraint.location, newUpperBound]);
    }

    switch (result) {
      case UnifyResult.OccursCheckFailed:
        this.reportError({ kind: "OccursCheckFailed" }, constraint.location, this.moduleNameOf(constraint));
        return false;
      case UnifyResult.TooComplex:
        this.reportError({ kind: "UnificationTooComplex" }, constraint.location, this.moduleNameOf(constraint));
        return false;
      case UnifyResult.Ok:
      default:
        return true;
    }
  }

  /** Makes `constraint` wait for the `target` constraint (Luau's `block` on a constraint). */
  blockOnConstraint(target: Constraint, constraint: Constraint): void {
    this.cgraph.addDependencyOf(target, constraint);
  }

  /** Makes a constraint wait for a type to be resolved. Always returns false, so that `tryDispatch` can return the result. */
  block(target: TypeId, constraint: Constraint): boolean {
    this.cgraph.addDependencyOf(follow(target), constraint);

    return false;
  }

  blockPack(target: TypePackId, constraint: Constraint): boolean {
    this.cgraph.addDependencyOf(followPack(target), constraint);

    return false;
  }

  /** Blocks a constraint on every one of `targets` (Luau's `block` template). */
  blockAll(targets: Iterable<TypeId>, constraint: Constraint): boolean {
    for (const target of targets) this.block(target, constraint);

    return false;
  }

  /** Makes every constraint that is blocked on `source` also blocked on `addition`. */
  inheritBlocks(source: Constraint, addition: Constraint): void {
    this.cgraph.inheritBlocks(source, addition);
  }

  unblock(ty: TypeId, _location: Location): void {
    const seen = new Set<TypeId>();

    let progressed = ty;
    for (;;) {
      if (seen.has(progressed)) throw new InternalCompilerError("ConstraintSolver::unblock encountered a self-bound type!");
      seen.add(progressed);

      const bt = get(progressed, "BoundType");
      if (bt) progressed = bt.boundTo;
      else break;
    }

    // The type passed on must be the unfollowed one, as unblocking it repairs every reference from `ty` to the type
    // it follows to.
    this.cgraph.unblockType(ty);
  }

  unblockPack(progressed: TypePackId, _location: Location): void {
    this.cgraph.unblockTypePack(progressed);
  }

  /**
   * Pushes the constraints that the new types a substitution copied need; at present, those are the reductions of type
   * function instances.
   */
  reproduceConstraints(scope: Scope, location: Location, subst: Substitution, moduleName: string | undefined): void {
    for (const [, newTy] of subst.newTypes) {
      if (get(newTy, "TypeFunctionInstanceType")) {
        this.pushConstraint(scope, location, { kind: "ReduceConstraint", ty: newTy }, moduleName);
      }
    }

    for (const [, newPack] of subst.newPacks) {
      if (getPack(newPack, "TypeFunctionInstanceTypePack")) {
        this.pushConstraint(scope, location, { kind: "ReducePackConstraint", tp: newPack }, moduleName);
      }
    }
  }

  /** Whether a type is blocked: a blocked type, a pending expansion, or an unsolved type function instance that is not uninhabited. */
  isBlocked(ty: TypeId): boolean {
    ty = follow(ty);

    const tfit = get(ty, "TypeFunctionInstanceType");
    if (tfit) {
      if (tfit.state !== TypeFunctionInstanceState.Unsolved) return false;
      return !this.uninhabitedTypeFunctions.has(ty);
    }

    return get(ty, "BlockedType") !== undefined || get(ty, "PendingExpansionType") !== undefined;
  }

  /** Whether a type pack is blocked: a blocked pack, or a type pack function instance that is not uninhabited. */
  isBlockedPack(tp: TypePackId): boolean {
    tp = followPack(tp);

    if (getPack(tp, "TypeFunctionInstanceTypePack")) return !this.uninhabitedTypeFunctions.has(tp);

    return getPack(tp, "BlockedTypePack") !== undefined;
  }

  /** Pushes a new constraint of the solver's own. A subtype or equality constraint already pushed is not pushed again. */
  pushConstraint(scope: Scope, location: Location, cv: ConstraintV, moduleName: string | undefined): Constraint {
    let scr: SubtypeConstraintRecord | undefined;
    if (cv.kind === "SubtypeConstraint") scr = { subTy: cv.subType, superTy: cv.superType, variance: SubtypingVariance.Covariant };
    else if (cv.kind === "EqualityConstraint") scr = { subTy: cv.assignmentType, superTy: cv.resultType, variance: SubtypingVariance.Invariant };

    const scrKey = scr ? subtypeConstraintRecordKey(scr) : undefined;
    if (scrKey !== undefined) {
      const f = this.seenConstraints.get(scrKey);
      if (f) return f;
    }

    const c = new Constraint(scope, location, cv, moduleName);

    if (scrKey !== undefined) this.seenConstraints.set(scrKey, c);

    this.solverConstraints.push(c);
    this.unsolvedConstraints.push(c);

    if (this.solverConstraintLimit > 0) {
      --this.solverConstraintLimit;

      if (this.solverConstraintLimit === 0) this.reportError({ kind: "CodeTooComplex" }, location, this.moduleNameOf(c));
    }

    return c;
  }

  /**
   * The type a module returns, which requiring it gives, or the error type when the module cannot be found or
   * required. The errors are reported at `location`, in `moduleName`.
   */
  resolveModule(info: ModuleInfo, location: Location, moduleName: string): TypeId {
    if (info.name === "") {
      this.reportError({ kind: "UnknownRequire", modulePath: "" }, location, moduleName);
      return this.builtinTypes.errorType;
    }

    for (const { path } of this.requireCycles) {
      if (path.length && path[0] === info.name) return this.builtinTypes.anyType;
    }

    const module = this.moduleResolver.getModule(info.name);
    if (!module) {
      if (!this.moduleResolver.moduleExists(info.name) && !info.optional) {
        this.reportError({ kind: "UnknownRequire", modulePath: this.moduleResolver.getHumanReadableModuleName(info.name) }, location, moduleName);
      }

      return this.builtinTypes.errorType;
    }

    if (!isModuleScript(module)) {
      this.reportError(
        illegalRequire(module.humanReadableName, "Module is not a ModuleScript. It cannot be required."),
        location,
        moduleName,
      );
      return this.builtinTypes.errorType;
    }

    const modulePack = module.returnType!;
    if (getPack(modulePack, "ErrorTypePack")) return this.builtinTypes.errorType;

    const moduleType = first(modulePack);
    if (!moduleType) {
      this.reportError(
        illegalRequire(module.humanReadableName, "Module does not return exactly 1 value. It cannot be required."),
        location,
        moduleName,
      );
      return this.builtinTypes.errorType;
    }

    return moduleType;
  }

  /** Records an error in `errorModule`, or in the representative module when that is empty. */
  reportError(data: TypeErrorData, location: Location, errorModule: string): void {
    this.errors.push(new LuauTypeError(location, data, errorModule === "" ? this.representativeModuleName : errorModule));
  }

  /**
   * The module a constraint belongs to, as Luau's `*constraint->moduleName`; a constraint made without one belongs to
   * the representative module.
   */
  private moduleNameOf(constraint: Constraint): string {
    return constraint.moduleName ?? this.representativeModuleName;
  }

  /**
   * Whether an outstanding constraint still involves a free type, which makes it unsafe to replace the type with one
   * of its bounds yet.
   */
  hasUnresolvedConstraints(ty: TypeId): boolean {
    ty = follow(ty);
    return this.cgraph.hasUnsolvedDependencies(ty);
  }

  simplifyIntersection(_scope: Scope, _location: Location, left: TypeId, right: TypeId): TypeId {
    return Simplify.simplifyIntersection(this.builtinTypes, this.arena, left, right).result;
  }

  simplifyIntersectionOf(_scope: Scope, _location: Location, parts: TypeIds): TypeId {
    return Simplify.simplifyIntersection(this.builtinTypes, this.arena, parts).result;
  }

  simplifyUnion(_scope: Scope, _location: Location, left: TypeId, right: TypeId): TypeId {
    return Simplify.simplifyUnion(this.builtinTypes, this.arena, left, right).result;
  }

  /** A module's return pack with its generics replaced by `any`: a generic variadic by `...any`, and others by `any`. */
  anyifyModuleReturnTypePackGenerics(tp: TypePackId): TypePackId {
    tp = followPack(tp);

    const vtp = getPack(tp, "VariadicTypePack");
    if (vtp) {
      const ty = follow(vtp.ty);
      return get(ty, "GenericType") ? this.builtinTypes.anyTypePack : tp;
    }

    if (!getPack(followPack(tp), "TypePack")) return tp;

    const resultTypes: TypeId[] = [];
    let resultTail: TypePackId | undefined;

    const { head, tail } = flatten(tp);

    for (const t of head) {
      const ty = follow(t);
      resultTypes.push(get(ty, "GenericType") ? this.builtinTypes.anyType : ty);
    }

    if (tail) resultTail = this.anyifyModuleReturnTypePackGenerics(tail);

    return this.arena.addTypePack(resultTypes, resultTail);
  }
}
