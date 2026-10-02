// Constraint generation, ported from Luau's `ConstraintGenerator.h`/
// `ConstraintGenerator.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).
//
// The generator walks a module's syntax tree once. It gives every expression
// a type, most of them free or blocked, creates the module's scopes, and
// records each relationship it finds between types as a constraint in the
// constraint graph, for the solver to dispatch. The order constraints, free
// types and scopes are created in follows Luau's, since it decides the
// solver's results and the names of printed types.

import {
  AstAttrType,
  AstExpr,
  AstExprBinary,
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprError,
  AstExprFunction,
  AstExprGlobal,
  AstExprGroup,
  AstExprIfElse,
  AstExprIndexExpr,
  AstExprIndexName,
  AstExprInstantiate,
  AstExprInterpString,
  AstExprLocal,
  AstExprTable,
  AstExprTypeAssertion,
  AstExprUnary,
  AstExprVarargs,
  AstStat,
  AstStatAssign,
  AstStatBlock,
  AstStatBreak,
  AstStatCompoundAssign,
  AstStatContinue,
  AstStatDeclareExternType,
  AstStatDeclareFunction,
  AstStatDeclareGlobal,
  AstStatError,
  AstStatExpr,
  AstStatFor,
  AstStatForIn,
  AstStatFunction,
  AstStatIf,
  AstStatLocal,
  AstStatLocalFunction,
  AstStatRepeat,
  AstStatReturn,
  AstStatTypeAlias,
  AstStatTypeFunction,
  AstStatWhile,
  AstTableAccess,
  AstType,
  AstTypeError,
  AstTypeFunction,
  AstTypeGroup,
  AstTypeIntersection,
  AstTypeOptional,
  AstTypePack,
  AstTypePackExplicit,
  AstTypePackGeneric,
  AstTypePackVariadic,
  AstTypeReference,
  AstTypeSingletonBool,
  AstTypeSingletonString,
  AstTypeTable,
  AstTypeTypeof,
  AstTypeUnion,
  BinaryOp,
  UnaryOp,
  visitAst,
  type AstAttr,
  type AstGenericType,
  type AstGenericTypePack,
  type AstLocal,
  type AstNode,
  type AstTypeList,
  type AstTypeOrPack,
  type AstVisitor,
} from "./Ast";
import { matchTypeGuard } from "./AstUtils";
import { matchAssert, matchSetMetatable } from "./BuiltinDefinitions";
import { Constraint, ValueContext, type ConstraintSet, type ConstraintV } from "./Constraint";
import type { ConstraintGraph } from "./ConstraintGraph";
import { ControlFlow, doesCallError, isLValue, matches, shouldTypestateForFirstArgument, type DataFlowGraph } from "./DataFlowGraph";
import {
  containsSubscriptedDefinition,
  getCell,
  getPhi,
  RefinementArena,
  type DefId,
  type LuauSymbol,
  type RefinementId,
  type RefinementKey,
} from "./Def";
import { LuauTypeError, UnknownSymbolContext, type TypeErrorData } from "./Error";
import { IterativeTypeVisitor } from "./IterativeTypeVisitor";
import { Location, Position } from "./Location";
import type { Module, ModuleResolver, RequireCycle } from "./Module";
import type { Normalizer } from "./Normalize";
import { Scope, subsumes } from "./Scope";
import { simplifyUnion } from "./Simplify";
import { sparkdownValue } from "./SparkdownReading";
import {
  blockedType,
  blockedTypePack,
  boundType,
  boundTypePack,
  emplaceType,
  emplaceTypePack,
  externType,
  finite,
  first,
  flatOptions,
  flatten,
  follow,
  followPack,
  freeTypePack,
  freshType,
  functionType,
  genericType,
  genericTypePack,
  get,
  getPack,
  getTableType,
  hasTag,
  intersectionType,
  InternalCompilerError,
  invertPolarity,
  is,
  isNil,
  isOptional,
  isTableUnion,
  metatableType,
  negationType,
  packSize,
  pendingExpansionType,
  Polarity,
  Property,
  Props,
  stringSingleton,
  TableIndexer,
  TableState,
  tableType,
  TypeFun,
  TypeLevel,
  typeFunctionInstanceType,
  typePack,
  unionType,
  variadicTypePack,
  type BlockedType,
  type BuiltinTypes,
  type FunctionArgument,
  type FunctionDefinition,
  type GenericTypeDefinition,
  type GenericTypePackDefinition,
  type TypeArena,
  type TypeFunctionInstanceType,
  type TypeId,
  type TypePack,
  type TypePackId,
  type TypePackVariant,
  type TypeVariant,
  type UserDefinedFunctionData,
} from "./Type";
import type { TypeFunction, TypeFunctionRuntime } from "./TypeFunction";
import { TypeIds } from "./TypeIds";
import {
  ErrorSuppression,
  extendTypePack,
  inConditional,
  occursCheck,
  reduceUnion,
  shouldSuppressErrors,
  TypeContext,
  UnionBuilder,
} from "./TypeUtils";
import { TypeOnceVisitor } from "./VisitType";

// Luau's `DFInt::LuauConstraintGeneratorRecursionLimit`.
const CONSTRAINT_GENERATOR_RECURSION_LIMIT = 300;
// Luau's `FInt::LuauPrimitiveInferenceInTableLimit`.
const PRIMITIVE_INFERENCE_IN_TABLE_LIMIT = 500;

/** The name the parser gives a declaration it could not read a name for (Luau's `kParseNameError`). */
const kParseNameError = "%error-id%";

/**
 * Marks an extern type that does not derive directly from the root extern
 * type as overriding what `typeof` returns (Luau's `kTypeofRootTag`).
 */
const kTypeofRootTag = "typeofRoot";

export interface Inference {
  ty: TypeId;
  refinement: RefinementId | undefined;
}

export interface InferencePack {
  tp: TypePackId;
  refinements: (RefinementId | undefined)[];
}

function inference(ty: TypeId, refinement?: RefinementId): Inference {
  return { ty, refinement };
}

function inferencePack(tp: TypePackId, refinements: (RefinementId | undefined)[] = []): InferencePack {
  return { tp, refinements };
}

/** A position in the constraint list, to find the constraints generated between two points. */
interface Checkpoint {
  offset: number;
}

/**
 * The scope and location of an unannotated local, and every type it has in
 * one of its states. The local's binding becomes the union of those types.
 */
interface InferredBinding {
  scope: Scope;
  location: Location;
  types: TypeIds;
}

interface InteriorFreeTypes {
  types: TypeId[];
  typePacks: TypePackId[];
}

interface RefinementPartition {
  /** The types to intersect with the type of the expression. */
  discriminantTypes: TypeId[];
  /** Whether the type discriminated against is implicitly nil too. */
  shouldAppendNilType: boolean;
}

type RefinementContext = Map<DefId, RefinementPartition>;

interface FunctionSignature {
  /** The type of the function. */
  signature: TypeId;
  /** The scope that encloses the function's signature. */
  signatureScope: Scope | undefined;
  /** The scope that encloses the function's body; a child of `signatureScope`. */
  bodyScope: Scope;
}

/** Luau's `BlockedType::setOwner`: a blocked type keeps its first owner. */
function setOwner(bt: BlockedType, newOwner: Constraint): void {
  if (bt.owner !== undefined) return;
  bt.owner = newOwner;
}

/** The location spanning a list of nodes, or an empty location for none (Luau's `getLocation`). */
function getLocation(array: readonly AstNode[]): Location {
  if (array.length === 0) return new Location();
  return new Location(array[0]!.location.begin, array[array.length - 1]!.location.end);
}

/** The attribute of a kind among a declaration's attributes, as Luau's `getAttribute`. */
function getAttribute(attributes: readonly AstAttr[], type: AstAttrType): AstAttr | undefined {
  for (const attribute of attributes) {
    if (attribute.type === type) return attribute;
  }
  return undefined;
}

/** A string literal read as a C string: Luau passes its bytes as `const char*` there, so an embedded NUL ends it. */
function cString(value: string): string {
  const nul = value.indexOf(String.fromCharCode(0));
  return nul === -1 ? value : value.slice(0, nul);
}

/** The argument of `require(argument)`, the one form of call the generator resolves a module for. */
function matchRequire(call: AstExprCall): AstExpr | undefined {
  const require = "require";

  if (call.args.length !== 1) return undefined;

  const funcAsGlobal = call.func instanceof AstExprGlobal ? call.func : undefined;
  if (!funcAsGlobal || funcAsGlobal.name !== require) return undefined;

  if (call.args.length !== 1) return undefined;

  return call.args[0];
}

function checkpoint(cg: ConstraintGenerator): Checkpoint {
  return { offset: cg.cgraph.constraints.length };
}

function forEachConstraint(start: Checkpoint, end: Checkpoint, cg: ConstraintGenerator, f: (constraint: Constraint) => void): void {
  for (let i = start.offset; i < end.offset; ++i) {
    f(cg.cgraph.constraints[i]!);
  }
}

/** For every constraint from `start` to `end`, blocks dispatching `target` on it. */
function addAllAsDependencies(start: Checkpoint, end: Checkpoint, cg: ConstraintGenerator, target: Constraint): void {
  forEachConstraint(start, end, cg, (ptr) => {
    cg.cgraph.addDependencyOf(ptr, target);
  });
}

/** For every constraint from `start` to `end`, blocks dispatching it on `target`. */
function addAllAsReverseDependencies(start: Checkpoint, end: Checkpoint, cg: ConstraintGenerator, target: Constraint): void {
  forEachConstraint(start, end, cg, (ptr) => {
    cg.cgraph.addDependencyOf(target, ptr);
  });
}

/**
 * For every constraint from `start` to `end`, blocks dispatching `target` on
 * it. The `PackSubtypeConstraint`s of return statements are also chained, each
 * blocked on the one before, to keep a behavior of Luau's old solver.
 */
function addAllAsDependenciesAndChainReturns(start: Checkpoint, end: Checkpoint, cg: ConstraintGenerator, target: Constraint): void {
  let previous: Constraint | undefined;
  forEachConstraint(start, end, cg, (constraint) => {
    cg.cgraph.addDependencyOf(constraint, target);
    const psc = constraint.get("PackSubtypeConstraint");
    if (psc && psc.returns) {
      if (previous) cg.cgraph.addDependencyOf(previous, constraint);

      previous = constraint;
    }
  });
}

class HasFreeType extends TypeOnceVisitor {
  result = false;

  constructor() {
    super("TypeOnceVisitor", /* skipBoundTypes */ true);
  }

  override visit(ty: TypeId): boolean {
    if (this.result || ty.persistent) return false;
    return true;
  }

  override visitPack(_tp: TypePackId): boolean {
    if (this.result) return false;
    return true;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "ExternType":
        return false;
      case "FreeType":
        this.result = true;
        return false;
      default:
        return this.visit(ty);
    }
  }

  override visitTypePack(tp: TypePackId, v: TypePackVariant): boolean {
    if (v.kind === "FreeTypePack") {
      this.result = true;
      return false;
    }
    return this.visitPack(tp);
  }
}

function hasFreeType(ty: TypeId): boolean {
  const hft = new HasFreeType();
  hft.traverse(ty);
  return hft.result;
}

function findSetmetatableTargetOf(target: TypeId): TypeId {
  target = follow(target);

  // This does not handle tables with `__metatable` correctly.
  const tt = get(target, "MetatableType");
  if (tt) return tt.table;

  return target;
}

/**
 * Constraint generation may be asked to simplify a union or intersection of
 * types that are not solved enough yet. This finds such types, so that the
 * simplification waits for constraint solving.
 */
class FindSimplificationBlockers extends IterativeTypeVisitor {
  found = false;

  constructor() {
    super("FindSimplificationBlockers", /* skipBoundTypes */ true);
  }

  override visit(_ty: TypeId): boolean {
    return !this.found;
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "BlockedType":
      case "FreeType":
      case "PendingExpansionType":
        this.found = true;
        return false;
      // Simplifying a function in a union or intersection needs nothing of
      // its argument or return types.
      case "FunctionType":
      case "ExternType":
        return false;
      default:
        return this.visit(ty);
    }
  }
}

function mustDeferIntersection(ty: TypeId): boolean {
  const bts = new FindSimplificationBlockers();
  bts.run(ty);
  return bts.found;
}

const enum RefinementsOpKind {
  Intersect,
  Refine,
  None,
}

function propagateDeprecatedAttributeToConstraint(c: ConstraintV, func: AstExprFunction): void {
  if (c.kind === "GeneralizationConstraint") {
    const deprecatedAttribute = func.getAttribute(AstAttrType.Deprecated);
    if (deprecatedAttribute) c.maybeDeprecatedAttr = deprecatedAttribute;
  }
}

function bindFreeType(a: TypeId, b: TypeId): void {
  const af = get(a, "FreeType");
  const bf = get(b, "FreeType");

  if (!bf) emplaceType(a, boundType(b));
  else if (!af) emplaceType(b, boundType(a));
  else if (subsumes(bf.scope, af.scope)) emplaceType(a, boundType(b));
  else if (subsumes(af.scope, bf.scope)) emplaceType(b, boundType(a));
}

function isMetamethod(name: string): boolean {
  return (
    name === "__index" ||
    name === "__newindex" ||
    name === "__call" ||
    name === "__concat" ||
    name === "__unm" ||
    name === "__add" ||
    name === "__sub" ||
    name === "__mul" ||
    name === "__div" ||
    name === "__mod" ||
    name === "__pow" ||
    name === "__tostring" ||
    name === "__metatable" ||
    name === "__eq" ||
    name === "__lt" ||
    name === "__le" ||
    name === "__mode" ||
    name === "__iter" ||
    name === "__len" ||
    name === "__idiv"
  );
}

function polarityOfAccess(access: AstTableAccess, p: Polarity): Polarity {
  switch (access) {
    case AstTableAccess.Read:
      return p;
    case AstTableAccess.Write:
      return invertPolarity(p);
    case AstTableAccess.ReadWrite:
      return Polarity.Mixed;
    default:
      return Polarity.Unknown;
  }
}

/** A key for a pair of a type and a property name, standing in for Luau's `std::pair<TypeId, std::string>`. */
function propIndexPairKey(ty: TypeId, index: string): string {
  return `${ty.serial}:${index}`;
}

/** A copy of a level, as C++ copies a `TypeLevel` by value. */
function copyLevel(level: TypeLevel): TypeLevel {
  return new TypeLevel(level.level, level.subLevel);
}

/** A copy of a type alias, as C++ copies a `TypeFun` by value. */
function copyTypeFun(tf: TypeFun): TypeFun {
  return new TypeFun(
    tf.type,
    tf.typeParams.map((p) => ({ ...p })),
    tf.typePackParams.map((p) => ({ ...p })),
    tf.definitionLocation,
  );
}

/**
 * The constraint generator must tell globals apart from accesses to undefined
 * symbols. Doing that in general is hard, so a first scan of the syntax tree
 * notes which globals the module defines.
 */
class GlobalPrepopulator implements AstVisitor {
  readonly uninitializedGlobals = new Set<string>();

  // Not part of Luau: the Luau inside these Sparkdown expressions is not
  // checked (`SparkdownReading.ts`), so it defines no globals.
  visitSparkdownInterpString(): boolean {
    return false;
  }

  visitSparkdownCallShorthand(): boolean {
    return false;
  }

  constructor(
    readonly globalScope: Scope,
    readonly arena: TypeArena,
    readonly dfg: DataFlowGraph,
  ) {}

  visit(node: AstNode): boolean {
    if (node instanceof AstExprGlobal) {
      const ty = this.globalScope.lookup(node.name);
      if (ty) {
        const def = this.dfg.getDef(node);
        this.globalScope.lvalueTypes.set(def, ty);
      }

      return true;
    }

    if (node instanceof AstStatAssign) {
      for (const expr of node.vars) {
        if (expr instanceof AstExprGlobal) {
          const g = expr;
          if (!this.globalScope.lookup(g.name)) this.globalScope.globalsToWarn.add(g.name);

          if (!this.globalScope.bindings.has(g.name)) {
            const bt = this.arena.addType(blockedType());
            this.uninitializedGlobals.add(g.name);
            this.globalScope.bindings.set(g.name, { typeId: bt, location: g.location });
          }
        }
      }

      return true;
    }

    if (node instanceof AstStatFunction) {
      if (node.name instanceof AstExprGlobal) {
        const g = node.name;
        const bt = this.arena.addType(blockedType());
        this.uninitializedGlobals.add(g.name);
        this.globalScope.bindings.set(g.name, { typeId: bt, location: new Location() });
      }

      return true;
    }

    // Every other node is visited, type annotations included, so that the
    // globals in `typeof` annotations are found too.
    return true;
  }
}

export class ConstraintGenerator {
  /** Every scope in the module, with the location it covers. */
  readonly scopes: [Location, Scope][] = [];

  readonly module: Module;
  private readonly sharedModuleName: string;
  readonly builtinTypes: BuiltinTypes;
  readonly arena: TypeArena;
  /** The root scope of the module; undefined until `visitModuleRoot`. */
  rootScope: Scope | undefined = undefined;

  private typeContext = TypeContext.Default;

  /**
   * A local can have several type states. A scope's binding for the local is
   * the union of every type the local can have over its lifetime, which this
   * map accumulates (see `recordInferredBinding` and `fillInInferredBindings`).
   */
  private readonly inferredBindings = new Map<LuauSymbol, InferredBinding>();

  /** The private scope of each type alias, which its type parameters belong to. */
  private readonly astTypeAliasDefiningScopes = new Map<AstStatTypeAlias, Scope>();

  /** The environment scope each type function's body is checked in, which the type functions of one block share. */
  private readonly astTypeFunctionEnvironmentScopes = new Map<AstStatTypeFunction, Scope>();

  readonly dfg: DataFlowGraph;
  private readonly refinementArena = new RefinementArena();

  private recursionCount = 0;

  /** The rare errors constraint generation itself reports. */
  errors: LuauTypeError[] = [];

  /** Keeps error suppression for immediate refinements. */
  private readonly normalizer: Normalizer;

  private readonly typeFunctionRuntime: TypeFunctionRuntime;

  /** Resolves modules so that `require` imports their types. */
  private readonly moduleResolver: ModuleResolver;

  private readonly globalScope: Scope;
  private readonly typeFunctionScope: Scope | undefined;

  private readonly prepareModuleScope: ((moduleName: string, scope: Scope) => void) | undefined;
  private readonly requireCycles: RequireCycle[];

  private readonly localTypes = new Map<TypeId, TypeIds>();

  private readonly inferredExprCache = new Map<AstExpr, Inference>();

  recursionLimitMet = false;

  readonly cgraph: ConstraintGraph;

  /** The module's generalization constraint, which the solver dispatches after every other constraint. */
  private moduleGeneralizationConstraint: Constraint | undefined;

  private readonly interiorFreeTypes: InteriorFreeTypes[] = [];

  private readonly unionsToSimplify: TypeId[] = [];

  private readonly uninitializedGlobals = new Set<string>();

  private polarity = Polarity.None;

  private readonly propIndexPairsSeen = new Map<string, TypeId>();

  /** How many large table literals the generator is inside, where literals are not inferred as singletons. */
  private largeTableDepth = 0;

  constructor(
    module: Module,
    normalizer: Normalizer,
    typeFunctionRuntime: TypeFunctionRuntime,
    moduleResolver: ModuleResolver,
    builtinTypes: BuiltinTypes,
    globalScope: Scope,
    typeFunctionScope: Scope | undefined,
    prepareModuleScope: ((moduleName: string, scope: Scope) => void) | undefined,
    dfg: DataFlowGraph,
    requireCycles: RequireCycle[],
    cgraph: ConstraintGraph,
  ) {
    this.module = module;
    this.sharedModuleName = module.name;
    this.builtinTypes = builtinTypes;
    this.arena = normalizer.arena;
    this.dfg = dfg;
    this.normalizer = normalizer;
    this.typeFunctionRuntime = typeFunctionRuntime;
    this.moduleResolver = moduleResolver;
    this.globalScope = globalScope;
    this.typeFunctionScope = typeFunctionScope;
    this.prepareModuleScope = prepareModuleScope;
    this.requireCycles = requireCycles;
    this.cgraph = cgraph;
  }

  /**
   * Generates the constraints of a module. The constraints, the free types
   * and the function of each signature scope go into the constraint graph;
   * the module's generalization constraint is deferred to the end of solving.
   */
  run(block: AstStatBlock): ConstraintSet {
    this.visitModuleRoot(block);

    const deferred: Constraint[] = [];
    if (this.moduleGeneralizationConstraint) {
      deferred.push(this.moduleGeneralizationConstraint);
      this.moduleGeneralizationConstraint = undefined;
    }

    const errors = this.errors;
    this.errors = [];
    return { rootScope: this.rootScope!, errors, deferredConstraints: deferred };
  }

  /**
   * The entry point: creates the module's scopes, constraints and free types.
   * @param block the root block to generate constraints for.
   */
  visitModuleRoot(block: AstStatBlock): void {
    const scope = Scope.child(this.globalScope);
    this.rootScope = scope;
    this.scopes.push([block.location, scope]);
    scope.location = block.location;
    this.module.astScopes.set(block, scope);

    this.interiorFreeTypes.push({ types: [], typePacks: [] });

    // The module's own scope for the type function environment.
    const localTypeFunctionScope = Scope.child(this.typeFunctionScope!);
    localTypeFunctionScope.location = block.location;
    this.typeFunctionRuntime.rootScope = localTypeFunctionScope;

    scope.returnType = this.freshTypePack(scope, Polarity.Positive);
    const moduleFnTy = this.arena.addType(functionType(this.builtinTypes.anyTypePack, scope.returnType));

    this.prepopulateGlobalScope(scope, block);

    const start = checkpoint(this);

    const cf = this.visitBlockWithoutChildScope(scope, block);
    if (cf === ControlFlow.None) {
      this.addConstraint(scope, block.location, {
        kind: "PackSubtypeConstraint",
        subPack: this.builtinTypes.emptyTypePack,
        superPack: scope.returnType,
        returns: false,
      });
    }

    const end = checkpoint(this);

    const result = this.arena.addType(blockedType());

    const moduleGeneralizationConstraint = new Constraint(
      scope,
      block.location,
      { kind: "GeneralizationConstraint", generalizedType: result, sourceType: moduleFnTy, maybeDeprecatedAttr: undefined, noGenerics: true },
      this.sharedModuleName,
    );
    this.moduleGeneralizationConstraint = moduleGeneralizationConstraint;
    setOwner(get(result, "BlockedType")!, moduleGeneralizationConstraint);
    addAllAsDependencies(start, end, this, moduleGeneralizationConstraint);

    const interior = this.interiorFreeTypes[this.interiorFreeTypes.length - 1]!;
    scope.interiorFreeTypes = interior.types;
    scope.interiorFreeTypePacks = interior.typePacks;

    this.interiorFreeTypes.pop();

    this.fillInInferredBindings(scope, block);

    for (const [ty, domain] of this.localTypes) {
      let domainTy = this.builtinTypes.neverType;
      for (let d of domain) {
        d = follow(d);
        if (d === ty) continue;
        domainTy = this.simplifyUnion(scope, new Location(), domainTy, d);
      }

      emplaceType(ty, boundType(domainTy));
    }

    for (const ty of this.unionsToSimplify) this.addConstraint(scope, block.location, { kind: "SimplifyConstraint", ty });
  }

  /**
   * A new free type belonging to a scope.
   * @param scope the scope the free type belongs to.
   */
  private freshType(scope: Scope, polarity = Polarity.Unknown): TypeId {
    const ft = freshType(this.arena, this.builtinTypes, scope, polarity);
    this.interiorFreeTypes[this.interiorFreeTypes.length - 1]!.types.push(ft);
    this.cgraph.freeTypes.add(ft);
    return ft;
  }

  /**
   * A new free type pack belonging to a scope.
   * @param scope the scope the free type pack belongs to.
   */
  private freshTypePack(scope: Scope, polarity = Polarity.Unknown): TypePackId {
    const result = this.arena.addTypePack(freeTypePack(scope, polarity));
    this.interiorFreeTypes[this.interiorFreeTypes.length - 1]!.typePacks.push(result);
    return result;
  }

  /**
   * A type pack with the given head and tail, without allocating an empty
   * pack: with no head it is the tail, or the empty pack when there is no
   * tail either.
   */
  private addTypePack(head: TypeId[], tail: TypePackId | undefined): TypePackId {
    if (head.length === 0) {
      if (tail) return tail;
      else return this.builtinTypes.emptyTypePack;
    } else return this.arena.addTypePack(head, tail);
  }

  /**
   * A new scope, the child of another.
   * @param node the syntax node the scope belongs to.
   * @param parent the parent of the new scope.
   */
  private childScope(node: AstNode, parent: Scope): Scope {
    const scope = Scope.child(parent);
    this.scopes.push([node.location, scope]);
    scope.location = node.location;

    scope.returnType = parent.returnType;
    scope.varargPack = parent.varargPack;

    parent.children.push(scope);
    this.module.astScopes.set(node, scope);

    return scope;
  }

  private lookup(scope: Scope, location: Location, def: DefId, prototype = true): TypeId | undefined {
    if (getCell(def)) return scope.lookupDef(def);
    const phi = getPhi(def);
    if (phi) {
      const found = scope.lookupDef(def);
      if (found) return found;
      else if (!prototype && phi.operands.length === 1) return this.lookup(scope, location, phi.operands[0]!, prototype);
      else if (!prototype) return undefined;

      let res = this.builtinTypes.neverType;

      for (const operand of phi.operands) {
        // An operand has a type only once its def has been seen, so a
        // missing one is prototyped with a blocked type to use later.
        let ty = this.lookup(scope, location, operand, /* prototype */ false);
        if (!ty) {
          ty = this.arena.addType(blockedType());
          if (!this.localTypes.has(ty)) this.localTypes.set(ty, new TypeIds());
          this.rootScope!.lvalueTypes.set(operand, ty);
        }

        res = this.makeUnion(scope, location, res, ty);
      }

      scope.lvalueTypes.set(def, res);
      return res;
    } else throw new InternalCompilerError("ConstraintGenerator::lookup is inexhaustive?");
  }

  /**
   * Adds a new constraint with no dependencies.
   * @param scope the scope of the constraint.
   * @param cv the constraint to add.
   * @returns the constraint added.
   */
  private addConstraint(scope: Scope, location: Location, cv: ConstraintV): Constraint {
    const c = new Constraint(scope, location, cv, this.sharedModuleName);
    this.cgraph.constraints.push(c);
    return c;
  }

  /** Adds a constraint made elsewhere; every caller makes it with the module's name already. */
  private addConstraintObject(_scope: Scope, c: Constraint): Constraint {
    this.cgraph.constraints.push(c);
    return c;
  }

  private unionRefinements(
    scope: Scope,
    location: Location,
    lhs: RefinementContext,
    rhs: RefinementContext,
    dest: RefinementContext,
    _constraints: ConstraintV[],
  ): void {
    const intersect = (types: TypeId[]): TypeId => {
      if (1 === types.length) return types[0]!;
      else if (2 === types.length) return this.makeIntersect(scope, location, types[0]!, types[1]!);

      return this.arena.addType(intersectionType([...types]));
    };

    for (const [def, partition] of lhs) {
      const rhsPartition = rhs.get(def);
      if (!rhsPartition) continue;

      const leftDiscriminantTy = partition.discriminantTypes.length === 1 ? partition.discriminantTypes[0]! : intersect(partition.discriminantTypes);

      const rightDiscriminantTy =
        rhsPartition.discriminantTypes.length === 1 ? rhsPartition.discriminantTypes[0]! : intersect(rhsPartition.discriminantTypes);

      if (!dest.has(def)) dest.set(def, { discriminantTypes: [], shouldAppendNilType: false });
      const destPartition = dest.get(def)!;
      destPartition.discriminantTypes.push(this.makeUnion(scope, location, leftDiscriminantTy, rightDiscriminantTy));
      destPartition.shouldAppendNilType ||= partition.shouldAppendNilType || rhsPartition.shouldAppendNilType;
    }
  }

  private computeRefinement(
    scope: Scope,
    location: Location,
    refinement: RefinementId,
    refis: RefinementContext,
    sense: boolean,
    eq: boolean,
    constraints: ConstraintV[],
  ): void {
    if (!refinement) return;
    else if (refinement.kind === "Variadic") {
      for (const refi of refinement.refinements) this.computeRefinement(scope, location, refi, refis, sense, eq, constraints);
    } else if (refinement.kind === "Negation") {
      return this.computeRefinement(scope, location, refinement.refinement, refis, !sense, eq, constraints);
    } else if (refinement.kind === "Conjunction") {
      const lhsRefis: RefinementContext = new Map();
      const rhsRefis: RefinementContext = new Map();

      this.computeRefinement(scope, location, refinement.lhs, sense ? refis : lhsRefis, sense, eq, constraints);
      this.computeRefinement(scope, location, refinement.rhs, sense ? refis : rhsRefis, sense, eq, constraints);

      if (!sense) this.unionRefinements(scope, location, lhsRefis, rhsRefis, refis, constraints);
    } else if (refinement.kind === "Disjunction") {
      const lhsRefis: RefinementContext = new Map();
      const rhsRefis: RefinementContext = new Map();

      this.computeRefinement(scope, location, refinement.lhs, sense ? lhsRefis : refis, sense, eq, constraints);
      this.computeRefinement(scope, location, refinement.rhs, sense ? rhsRefis : refis, sense, eq, constraints);

      if (sense) this.unionRefinements(scope, location, lhsRefis, rhsRefis, refis, constraints);
    } else if (refinement.kind === "Equivalence") {
      this.computeRefinement(scope, location, refinement.lhs, refis, sense, true, constraints);
      this.computeRefinement(scope, location, refinement.rhs, refis, sense, true, constraints);
    } else if (refinement.kind === "Proposition") {
      let discriminantTy = refinement.discriminantTy;

      // A negative sense negates the discriminant.
      if (!sense) {
        const nt = get(follow(discriminantTy), "NegationType");
        if (nt) discriminantTy = nt.ty;
        else discriminantTy = this.arena.addType(negationType(discriminantTy));
      }

      if (eq) {
        discriminantTy = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.singletonFunc, [discriminantTy], [], scope, location);
      }

      for (let key: RefinementKey | undefined = refinement.key; key; key = key.parent) {
        if (!refis.has(key.def)) refis.set(key.def, { discriminantTypes: [], shouldAppendNilType: false });
        refis.get(key.def)!.discriminantTypes.push(discriminantTy);

        // The leaf of the key.
        if (key.propName === undefined) break;

        const nextDiscriminantTy = this.arena.addType(tableType());
        const table = get(nextDiscriminantTy, "TableType")!;
        table.props.set(key.propName, Property.readonly(discriminantTy));
        table.scope = scope;
        table.state = TableState.Sealed;

        discriminantTy = nextDiscriminantTy;
      }

      // When the top-level expression is `t[x]`, it refines to `nil`, not `never`.
      refis.get(refinement.key.def)!.shouldAppendNilType =
        (sense || !eq) && containsSubscriptedDefinition(refinement.key.def) && !refinement.implicitFromCall;
    }
  }

  private applyRefinements(scope: Scope, location: Location, refinement: RefinementId): void {
    if (!refinement) return;

    const refinements: RefinementContext = new Map();
    const constraints: ConstraintV[] = [];
    this.computeRefinement(scope, location, refinement, refinements, /* sense */ true, /* eq */ false, constraints);
    const flushConstraints = (kind: RefinementsOpKind, ty: TypeId, discriminants: TypeId[]): TypeId => {
      if (discriminants.length === 0) return ty;
      if (kind === RefinementsOpKind.None) return ty;
      const args = [ty];
      const func: TypeFunction =
        kind === RefinementsOpKind.Intersect ? this.builtinTypes.typeFunctions.intersectFunc : this.builtinTypes.typeFunctions.refineFunc;
      args.push(...discriminants);
      const resultType = this.createTypeFunctionInstance(func, args, [], scope, location);
      discriminants.length = 0;
      return resultType;
    };

    for (const [def, partition] of refinements) {
      const defTy = this.lookup(scope, location, def);
      if (defTy) {
        let ty = defTy;
        // The type is intersected with every discriminant type. Consecutive
        // discriminants share one type function instance with many arguments,
        // since a chain of one instance per discriminant, each checked with
        // `mustDeferIntersection`, overflows the stack on large types. Once
        // either type is not solved enough, the rest go through a `refine`
        // instance, which waits for the solver.
        const discriminants: TypeId[] = [];
        let kind = RefinementsOpKind.None;
        let mustDefer = mustDeferIntersection(ty);
        for (const dt of partition.discriminantTypes) {
          mustDefer = mustDefer || mustDeferIntersection(dt);
          if (mustDefer) {
            if (kind === RefinementsOpKind.Intersect) ty = flushConstraints(kind, ty, discriminants);
            kind = RefinementsOpKind.Refine;

            discriminants.push(dt);
          } else {
            const status = shouldSuppressErrors(this.normalizer, ty);
            if (status === ErrorSuppression.NormalizationFailed) this.reportError(location, { kind: "NormalizationTooComplex" });
            if (kind === RefinementsOpKind.Refine) ty = flushConstraints(kind, ty, discriminants);
            kind = RefinementsOpKind.Intersect;

            discriminants.push(dt);

            if (status === ErrorSuppression.Suppress) {
              ty = flushConstraints(kind, ty, discriminants);
              ty = this.makeUnion(scope, location, ty, this.builtinTypes.errorType);
            }
          }
        }

        // The discriminants left over make one last constraint.
        if (kind !== RefinementsOpKind.None) ty = flushConstraints(kind, ty, discriminants);

        if (partition.shouldAppendNilType) {
          ty = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.weakoptionalFunc, [ty], [], scope, location);
        }
        this.updateRValueRefinements(scope, def, ty);
      }
    }

    for (const c of constraints) this.addConstraint(scope, location, c);
  }

  /**
   * Recursive and mutually recursive type aliases are handled in two passes.
   * This first pass scans the block's surface, counts the generic parameters
   * of each alias and stands a blocked type in for it; the main pass works
   * out how to expand them.
   */
  private prototypeTypeDefinitions(scope: Scope, block: AstStatBlock): void {
    const typeNameLocations = new Map<string, Location>();

    let hasTypeFunction = false;

    // Mutually recursive type aliases need every type binding in place
    // before any alias statement is checked.
    for (const stat of block.body) {
      if (stat instanceof AstStatTypeAlias) {
        const alias = stat;
        if (this.globalScope.builtinTypeNames.has(alias.name)) {
          this.reportError(alias.location, { kind: "DuplicateTypeDefinition", name: alias.name });
          continue;
        }

        // A syntactically illegal type alias may have no name, and then
        // nothing is prepopulated for it.
        if (alias.name === kParseNameError || alias.name === "typeof") continue;

        const loc = typeNameLocations.get(alias.name);
        if (loc) {
          this.reportError(alias.location, { kind: "DuplicateTypeDefinition", name: alias.name, previousLocation: loc });
          continue;
        }

        const defnScope = this.childScope(alias, scope);

        const initialType = this.arena.addType(blockedType());
        const initialFun = new TypeFun(initialType);

        // `addTypes` is false so that the generic parameters stay out of the
        // private type bindings until the alias is checked and their defaults
        // are resolved; otherwise `F<T... = ...T>` would resolve `T` to
        // itself instead of reporting an error.
        for (const [, gen] of this.createGenerics(defnScope, alias.generics, /* useCache */ true, /* addTypes */ false)) {
          initialFun.typeParams.push(gen);
        }

        for (const [, genPack] of this.createGenericPacks(defnScope, alias.genericPacks, /* useCache */ true, /* addTypes */ false)) {
          initialFun.typePackParams.push(genPack);
        }
        initialFun.definitionLocation = alias.location;

        if (alias.exported) scope.exportedTypeBindings.set(alias.name, initialFun);
        else scope.privateTypeBindings.set(alias.name, initialFun);

        this.astTypeAliasDefiningScopes.set(alias, defnScope);
        typeNameLocations.set(alias.name, alias.location);
      } else if (stat instanceof AstStatTypeFunction) {
        const fn = stat;
        hasTypeFunction = true;

        // A syntactically illegal type function may have no name, and then no
        // type is bound for it, as for a type alias. Luau binds its
        // placeholder name, which would show in a duplicate's error.
        if (fn.name === kParseNameError) continue;

        const loc = typeNameLocations.get(fn.name);
        if (loc) {
          this.reportError(fn.location, { kind: "DuplicateTypeDefinition", name: fn.name, previousLocation: loc });
          continue;
        }

        // The type takes one type parameter for each parameter of the function.
        const typeParams: TypeId[] = [];
        const quantifiedTypeParams: GenericTypeDefinition[] = [];
        for (let i = 0; i < fn.body.args.length; i++) {
          const ty = this.arena.addType(genericType({ name: `T${i}`, polarity: Polarity.Unknown }));
          typeParams.push(ty);
          quantifiedTypeParams.push({ ty });
        }

        // Luau registers the function with its type function runtime here,
        // compiling it for the VM. Sparkdown has no VM, so a use of the type
        // reports that it cannot be evaluated.

        const udtfData: UserDefinedFunctionData = { definition: fn, environmentFunction: new Map(), environmentAlias: new Map() };

        const typeFunctionTy = this.arena.addType(typeFunctionInstanceType(this.builtinTypes.typeFunctions.userFunc, typeParams, [], fn.name, udtfData));

        const typeFunction = new TypeFun(typeFunctionTy, quantifiedTypeParams);
        typeFunction.definitionLocation = fn.location;

        if (fn.exported) scope.exportedTypeBindings.set(fn.name, typeFunction);
        else scope.privateTypeBindings.set(fn.name, typeFunction);

        typeNameLocations.set(fn.name, fn.location);
      } else if (stat instanceof AstStatDeclareExternType) {
        const classDeclaration = stat;
        // A syntactically illegal class may have no name, and then nothing is
        // prepopulated for it.
        if (classDeclaration.name === kParseNameError) continue;

        const loc = typeNameLocations.get(classDeclaration.name);
        if (loc) {
          this.reportError(classDeclaration.location, { kind: "DuplicateTypeDefinition", name: classDeclaration.name, previousLocation: loc });
          continue;
        }

        this.childScope(classDeclaration, scope);

        const initialType = this.arena.addType(blockedType());
        const initialFun = new TypeFun(initialType);
        initialFun.definitionLocation = classDeclaration.location;
        scope.exportedTypeBindings.set(classDeclaration.name, initialFun);

        typeNameLocations.set(classDeclaration.name, classDeclaration.location);
      }
    }

    if (hasTypeFunction) this.prototypeTypeFunctionEnvironment(scope, block);
  }

  /**
   * Fills in the environments of the block's type functions: the one scope
   * all their bodies are checked in, under the type function runtime's, where
   * each type function of the block is a value; and the type functions and
   * type aliases of the module's enclosing scopes that each one can see.
   */
  private prototypeTypeFunctionEnvironment(scope: Scope, block: AstStatBlock): void {
    const typeFunctionEnvScope = Scope.child(this.typeFunctionRuntime.rootScope!);

    const createdTypeFunctions: TypeFunctionInstanceType[] = [];
    const referencedTypeFunctions = new Map<AstStatTypeFunction, TypeFunctionInstanceType>();

    for (const stat of block.body) {
      if (!(stat instanceof AstStatTypeFunction)) continue;
      const fn = stat;

      // As globals are prepopulated, each type function has a binding in the
      // environment before any body is checked.
      const bt = this.arena.addType(blockedType());
      typeFunctionEnvScope.bindings.set(fn.name, { typeId: bt, location: fn.location });
      this.astTypeFunctionEnvironmentScopes.set(fn, typeFunctionEnvScope);

      // The type function already made for the name, which a duplicate shares.
      const binding = scope.privateTypeBindings.get(fn.name) ?? scope.exportedTypeBindings.get(fn.name);
      const mainTypeFun = binding ? get(binding.type, "TypeFunctionInstanceType") : undefined;
      if (!mainTypeFun?.userFuncData) continue;

      createdTypeFunctions.push(mainTypeFun);

      const globalNames = new Set<string>();
      visitAst(fn, {
        visit: (node) => {
          if (node instanceof AstExprGlobal) globalNames.add(node.name);
          return true;
        },
      });

      const userFuncData = mainTypeFun.userFuncData;

      const addToEnvironment = (name: string, tf: TypeFun) => {
        const ty = get(follow(tf.type), "TypeFunctionInstanceType");
        if (ty?.userFuncData) {
          if (userFuncData.environmentFunction.has(name)) return;

          const definition = ty.userFuncData.definition;
          userFuncData.environmentFunction.set(name, definition);

          referencedTypeFunctions.set(definition, ty);

          const existing = this.astTypeFunctionEnvironmentScopes.get(definition)?.linearSearchForBinding(name, /* traverseScopeChain */ false);
          if (existing) typeFunctionEnvScope.bindings.set(definition.name, { typeId: existing.typeId, location: definition.location });
        } else if (!ty) {
          if (userFuncData.environmentAlias.has(name)) return;

          // Only the aliases a body names are registered.
          if (!globalNames.has(name)) return;

          userFuncData.environmentAlias.set(name, tf);

          typeFunctionEnvScope.bindings.set(name, { typeId: this.builtinTypes.anyType, location: tf.definitionLocation ?? new Location() });
        }
      };

      // Up the scopes to register type functions and aliases, but without
      // reaching into the global scope.
      for (let curr: Scope | undefined = scope; curr && curr !== this.globalScope; curr = curr.parent) {
        for (const [name, tf] of curr.privateTypeBindings) addToEnvironment(name, tf);
        for (const [name, tf] of curr.exportedTypeBindings) addToEnvironment(name, tf);
      }
    }

    // Each global a body names gets the environment's type for it.
    for (const stat of block.body) {
      if (!(stat instanceof AstStatTypeFunction)) continue;
      visitAst(stat.body, {
        visit: (node) => {
          if (node instanceof AstExprGlobal) {
            const ty = typeFunctionEnvScope.lookup(node.name);
            if (ty) typeFunctionEnvScope.lvalueTypes.set(this.dfg.getDef(node), ty);
          }
          return true;
        },
      });
    }

    // A type function also sees the aliases of the type functions it can call.
    for (const type of createdTypeFunctions) {
      const sourceFuncData = type.userFuncData!;

      for (const definition of sourceFuncData.environmentFunction.values()) {
        const target = referencedTypeFunctions.get(definition);
        if (!target) continue;

        for (const [aliasName, alias] of target.userFuncData!.environmentAlias) {
          if (!sourceFuncData.environmentAlias.has(aliasName)) sourceFuncData.environmentAlias.set(aliasName, alias);
        }
      }
    }
  }

  private visitBlockWithoutChildScope(scope: Scope, block: AstStatBlock): ControlFlow {
    this.recursionCount++;
    try {
      if (this.recursionCount >= CONSTRAINT_GENERATOR_RECURSION_LIMIT) {
        this.reportCodeTooComplex(block.location);
        return ControlFlow.None;
      }

      this.prototypeTypeDefinitions(scope, block);

      let firstControlFlow: ControlFlow | undefined;
      for (const stat of block.body) {
        const cf = this.visitStat(scope, stat);
        if (cf !== ControlFlow.None && firstControlFlow === undefined) firstControlFlow = cf;
      }

      return firstControlFlow ?? ControlFlow.None;
    } finally {
      this.recursionCount--;
    }
  }

  private visitStat(scope: Scope, stat: AstStat): ControlFlow {
    this.recursionCount++;
    try {
      if (this.recursionCount >= CONSTRAINT_GENERATOR_RECURSION_LIMIT) {
        this.reportCodeTooComplex(stat.location);
        return ControlFlow.None;
      }

      if (stat instanceof AstStatBlock) return this.visitBlock(scope, stat);
      else if (stat instanceof AstStatIf) return this.visitIf(scope, stat);
      else if (stat instanceof AstStatWhile) return this.visitWhile(scope, stat);
      else if (stat instanceof AstStatRepeat) return this.visitRepeat(scope, stat);
      else if (stat instanceof AstStatBreak) return ControlFlow.Breaks;
      else if (stat instanceof AstStatContinue) return ControlFlow.Continues;
      else if (stat instanceof AstStatReturn) return this.visitReturn(scope, stat);
      else if (stat instanceof AstStatExpr) {
        this.checkPack(scope, stat.expr);

        if (stat.expr instanceof AstExprCall && doesCallError(stat.expr)) return ControlFlow.Throws;

        return ControlFlow.None;
      } else if (stat instanceof AstStatLocal) return this.visitLocal(scope, stat);
      else if (stat instanceof AstStatFor) return this.visitFor(scope, stat);
      else if (stat instanceof AstStatForIn) return this.visitForIn(scope, stat);
      else if (stat instanceof AstStatAssign) return this.visitAssign(scope, stat);
      else if (stat instanceof AstStatCompoundAssign) return this.visitCompoundAssign(scope, stat);
      else if (stat instanceof AstStatFunction) return this.visitFunction(scope, stat);
      else if (stat instanceof AstStatLocalFunction) return this.visitLocalFunction(scope, stat);
      else if (stat instanceof AstStatTypeAlias) return this.visitTypeAlias(scope, stat);
      else if (stat instanceof AstStatTypeFunction) return this.visitTypeFunction(scope, stat);
      else if (stat instanceof AstStatDeclareGlobal) return this.visitDeclareGlobal(scope, stat);
      else if (stat instanceof AstStatDeclareFunction) return this.visitDeclareFunction(scope, stat);
      else if (stat instanceof AstStatDeclareExternType) return this.visitDeclareExternType(scope, stat);
      else if (stat instanceof AstStatError) return this.visitError(scope, stat);
      else return ControlFlow.None;
    } finally {
      this.recursionCount--;
    }
  }

  private visitLocal(scope: Scope, statLocal: AstStatLocal): ControlFlow {
    const annotatedTypes: TypeId[] = [];
    let hasAnnotation = false;

    const expectedTypes: (TypeId | undefined)[] = [];

    const assignees: TypeId[] = [];

    // Names the first value type, even when it is not among the variable
    // types, for synthetic name attribution.
    let firstValueType: TypeId | undefined;

    for (const local of statLocal.vars) {
      const location = local.location;

      const assignee = this.arena.addType(blockedType());

      if (!this.localTypes.has(assignee)) this.localTypes.set(assignee, new TypeIds());
      assignees.push(assignee);

      if (!firstValueType) firstValueType = assignee;

      if (local.annotation) {
        hasAnnotation = true;
        const annotationTy = this.resolveType(scope, local.annotation, /* inTypeArguments */ false);
        annotatedTypes.push(annotationTy);
        expectedTypes.push(annotationTy);
        scope.bindings.set(local, { typeId: annotationTy, location });
      } else {
        // `annotatedTypes` has one type per local; a local without an
        // annotation takes the most conservative type.
        annotatedTypes.push(this.builtinTypes.unknownType);

        expectedTypes.push(undefined);
        scope.bindings.set(local, { typeId: this.builtinTypes.unknownType, location });

        this.inferredBindings.set(local, { scope, location, types: new TypeIds([assignee]) });
      }

      const def = this.dfg.getLocalDef(local);
      scope.lvalueTypes.set(def, assignee);
    }

    const start = checkpoint(this);
    const rvaluePack = this.checkPackList(scope, statLocal.values, expectedTypes, /* generalize */ true).tp;
    const end = checkpoint(this);

    const deferredTypes: TypeId[] = [];
    const { head, tail } = flatten(rvaluePack);

    // Kept apart from `deferredTypes` to tell the blocked types minted here
    // from the ones that stand for annotations.
    const freshBlockedTypes = new Set<BlockedType>();

    for (let i = 0; i < statLocal.vars.length; ++i) {
      const localDomain = this.localTypes.get(assignees[i]!)!;

      if (statLocal.vars[i]!.annotation) {
        localDomain.insert(annotatedTypes[i]!);
        if (i >= head.length && tail) {
          const deferredType = this.arena.addType(blockedType());
          deferredTypes.push(deferredType);
          freshBlockedTypes.add(get(deferredType, "BlockedType")!);
        }
      } else {
        if (i < head.length) {
          localDomain.insert(head[i]!);
        } else if (tail) {
          const deferredType = this.arena.addType(blockedType());
          deferredTypes.push(deferredType);
          localDomain.insert(deferredType);
          freshBlockedTypes.add(get(deferredType, "BlockedType")!);
        } else {
          localDomain.insert(this.builtinTypes.nilType);
        }
      }
    }

    if (hasAnnotation) {
      const annotatedPack = this.arena.addTypePack(annotatedTypes);
      this.addConstraint(scope, statLocal.location, { kind: "PackSubtypeConstraint", subPack: rvaluePack, superPack: annotatedPack, returns: false });
    }

    if (deferredTypes.length !== 0) {
      const uc = this.addConstraint(scope, statLocal.location, { kind: "UnpackConstraint", resultPack: deferredTypes, sourcePack: tail! });

      addAllAsDependencies(start, end, this, uc);
      for (const bt of freshBlockedTypes) setOwner(bt, uc);
    }

    if (statLocal.vars.length === 1 && statLocal.values.length === 1 && firstValueType && scope === this.rootScope && !hasAnnotation) {
      const variable = statLocal.vars[0]!;
      const value = statLocal.values[0]!;

      if (value instanceof AstExprTable) {
        this.addConstraint(scope, value.location, {
          kind: "NameConstraint",
          namedType: firstValueType,
          name: variable.name,
          synthetic: true,
          typeParameters: [],
          typePackParameters: [],
        });
      } else if (value instanceof AstExprCall) {
        if (matchSetMetatable(value)) {
          this.addConstraint(scope, value.location, {
            kind: "NameConstraint",
            namedType: firstValueType,
            name: variable.name,
            synthetic: true,
            typeParameters: [],
            typePackParameters: [],
          });
        }
      }
    }

    if (statLocal.values.length > 0) {
      // A `require` imports the exported type bindings of the module it
      // names into the variable's namespace.
      for (let i = 0; i < statLocal.values.length && i < statLocal.vars.length; ++i) {
        const call = statLocal.values[i];
        if (!(call instanceof AstExprCall)) continue;

        const maybeRequire = matchRequire(call);
        if (!maybeRequire) continue;

        const require = maybeRequire;

        const moduleInfo = this.moduleResolver.resolveModuleInfo(this.module.name, require);
        if (!moduleInfo) continue;

        const module = this.moduleResolver.getModule(moduleInfo.name);
        if (!module) continue;

        const name = statLocal.vars[i]!.name;
        const importedBindings = new Map<string, TypeFun>();
        for (const [typeName, tf] of module.exportedTypeBindings) importedBindings.set(typeName, copyTypeFun(tf));
        scope.importedTypeBindings.set(name, importedBindings);
        scope.importedModules.set(name, moduleInfo.name);

        // The imported types of a require that leads back to this module are replaced with `any`.
        for (const { path } of this.requireCycles) {
          if (path.length === 0 || path[0] !== moduleInfo.name) continue;

          const bindings = scope.importedTypeBindings.get(name)!;
          for (const typeName of [...bindings.keys()]) bindings.set(typeName, new TypeFun(this.builtinTypes.anyType));
        }
      }
    }

    return ControlFlow.None;
  }

  private visitFor(scope: Scope, for_: AstStatFor): ControlFlow {
    let annotationTy = this.builtinTypes.numberType;
    if (for_.variable.annotation) annotationTy = this.resolveType(scope, for_.variable.annotation, /* inTypeArguments */ false);

    const inferNumber = (expr: AstExpr | undefined): void => {
      if (!expr) return;

      const t = this.check(scope, expr).ty;
      this.addConstraint(scope, expr.location, { kind: "SubtypeConstraint", subType: t, superType: this.builtinTypes.numberType });
    };

    inferNumber(for_.from);
    inferNumber(for_.to);
    inferNumber(for_.step);

    const forScope = this.childScope(for_, scope);
    forScope.bindings.set(for_.variable, { typeId: annotationTy, location: for_.variable.location });

    const def = this.dfg.getLocalDef(for_.variable);
    forScope.lvalueTypes.set(def, annotationTy);
    this.updateRValueRefinements(forScope, def, annotationTy);

    this.visitBlock(forScope, for_.body);

    scope.inheritAssignments(forScope);

    return ControlFlow.None;
  }

  private visitForIn(scope: Scope, forIn: AstStatForIn): ControlFlow {
    const loopScope = this.childScope(forIn, scope);
    const iterator = this.checkPackList(scope, forIn.values, [], true).tp;

    const variableTypes: TypeId[] = [];

    for (const variable of forIn.vars) {
      const loopVar = this.arena.addType(blockedType());
      variableTypes.push(loopVar);

      const def = this.dfg.getLocalDef(variable);

      if (variable.annotation) {
        const annotationTy = this.resolveType(loopScope, variable.annotation, /* inTypeArguments */ false);
        loopScope.bindings.set(variable, { typeId: annotationTy, location: variable.location });
        this.addConstraint(scope, variable.location, { kind: "SubtypeConstraint", subType: loopVar, superType: annotationTy });
        loopScope.lvalueTypes.set(def, annotationTy);
      } else {
        loopScope.bindings.set(variable, { typeId: loopVar, location: variable.location });
        loopScope.lvalueTypes.set(def, loopVar);
      }
    }

    const iterable = this.addConstraint(loopScope, getLocation(forIn.values), {
      kind: "IterableConstraint",
      iterator,
      variables: variableTypes,
      nextAstFragment: forIn.values[0],
      astForInNextTypes: this.module.astForInNextTypes,
    });

    // An intersection with `~nil` on the key variable says that it cannot be nil.
    const keyVar = forIn.vars[0]!;
    const keyDef = this.dfg.getLocalDef(keyVar);
    const loopVar = loopScope.lvalueTypes.get(keyDef)!;

    const intersectionTy = this.createTypeFunctionInstance(
      this.builtinTypes.typeFunctions.refineFunc,
      [loopVar, this.builtinTypes.notNilType],
      [],
      loopScope,
      keyVar.location,
    );

    loopScope.bindings.set(keyVar, { typeId: intersectionTy, location: keyVar.location });
    loopScope.lvalueTypes.set(keyDef, intersectionTy);

    const c = this.addConstraint(loopScope, keyVar.location, { kind: "ReduceConstraint", ty: intersectionTy });
    this.cgraph.addDependencyOf(iterable, c);
    for (const variableType of variableTypes) {
      const bt = get(variableType, "BlockedType")!;
      setOwner(bt, iterable);
    }

    const start = checkpoint(this);
    this.visitBlock(loopScope, forIn.body);
    const end = checkpoint(this);

    scope.inheritAssignments(loopScope);

    // The iterable constraint dispatches first.
    addAllAsReverseDependencies(start, end, this, iterable);
    return ControlFlow.None;
  }

  private visitWhile(scope: Scope, while_: AstStatWhile): ControlFlow {
    const refinement = this.check(scope, while_.condition).refinement;

    const whileScope = this.childScope(while_, scope);
    this.applyRefinements(whileScope, while_.condition.location, refinement);

    this.visitBlock(whileScope, while_.body);

    scope.inheritAssignments(whileScope);

    return ControlFlow.None;
  }

  private visitRepeat(scope: Scope, repeat: AstStatRepeat): ControlFlow {
    const repeatScope = this.childScope(repeat, scope);

    this.visitBlockWithoutChildScope(repeatScope, repeat.body);

    this.check(repeatScope, repeat.condition);

    scope.inheritAssignments(repeatScope);

    return ControlFlow.None;
  }

  private visitLocalFunction(scope: Scope, fn: AstStatLocalFunction): ControlFlow {
    // The parser gives every local function a distinct symbol for its name.
    const functionType = this.arena.addType(blockedType());
    scope.bindings.set(fn.name, { typeId: functionType, location: fn.name.location });

    const sig = this.checkFunctionSignature(scope, fn.func, /* expectedType */ undefined, fn.name.location);
    sig.bodyScope.bindings.set(fn.name, { typeId: sig.signature, location: fn.name.location });

    const def = this.dfg.getLocalDef(fn.name);
    scope.lvalueTypes.set(def, functionType);
    this.updateRValueRefinements(scope, def, functionType);
    sig.bodyScope.lvalueTypes.set(def, sig.signature);
    this.updateRValueRefinements(sig.bodyScope, def, sig.signature);

    const start = checkpoint(this);
    this.checkFunctionBody(sig.bodyScope, fn.func);
    const end = checkpoint(this);

    const constraintScope = sig.signatureScope ? sig.signatureScope : sig.bodyScope;
    const c = new Constraint(
      constraintScope,
      fn.name.location,
      { kind: "GeneralizationConstraint", generalizedType: functionType, sourceType: sig.signature, maybeDeprecatedAttr: undefined, noGenerics: false },
      this.sharedModuleName,
    );

    propagateDeprecatedAttributeToConstraint(c.c, fn.func);

    addAllAsDependenciesAndChainReturns(start, end, this, c);
    setOwner(get(functionType, "BlockedType")!, this.addConstraintObject(scope, c));
    this.module.astTypes.set(fn.func, functionType);

    return ControlFlow.None;
  }

  private visitFunction(scope: Scope, fn: AstStatFunction): ControlFlow {
    // The name is a local, a global or an index expression, with or without self.

    const start = checkpoint(this);
    const sig = this.checkFunctionSignature(scope, fn.func, /* expectedType */ undefined, fn.name.location);

    const def = this.dfg.getDef(fn.name);

    if (fn.name instanceof AstExprLocal) {
      const localName = fn.name;
      sig.bodyScope.bindings.set(localName.local, { typeId: sig.signature, location: localName.location });
      sig.bodyScope.lvalueTypes.set(def, sig.signature);
      this.updateRValueRefinements(sig.bodyScope, def, sig.signature);
    } else if (fn.name instanceof AstExprGlobal) {
      const globalName = fn.name;
      sig.bodyScope.bindings.set(globalName.name, { typeId: sig.signature, location: globalName.location });
      sig.bodyScope.lvalueTypes.set(def, sig.signature);
      this.updateRValueRefinements(sig.bodyScope, def, sig.signature);
    } else if (fn.name instanceof AstExprIndexName) {
      this.updateRValueRefinements(sig.bodyScope, def, sig.signature);
    }

    if (fn.name instanceof AstExprIndexName) {
      const indexName = fn.name;
      const beginProp = checkpoint(this);
      const { ty: fnTy } = this.checkIndexNameExpr(scope, indexName);
      const endProp = checkpoint(this);
      const pftc = this.addConstraint(sig.signatureScope!, fn.func.location, {
        kind: "PushFunctionTypeConstraint",
        expectedFunctionType: fnTy,
        functionType: sig.signature,
        expr: fn.func,
        isSelf: indexName.op === ":",
      });

      addAllAsDependencies(beginProp, endProp, this, pftc);

      const beginBody = checkpoint(this);
      this.checkFunctionBody(sig.bodyScope, fn.func);
      const endBody = checkpoint(this);

      addAllAsReverseDependencies(beginBody, endBody, this, pftc);
    } else {
      this.checkFunctionBody(sig.bodyScope, fn.func);
    }

    const end = checkpoint(this);

    let generalizedType = this.arena.addType(blockedType());
    const constraintScope = sig.signatureScope ? sig.signatureScope : sig.bodyScope;

    const c = this.addConstraint(constraintScope, fn.name.location, {
      kind: "GeneralizationConstraint",
      generalizedType,
      sourceType: sig.signature,
      maybeDeprecatedAttr: undefined,
      noGenerics: false,
    });
    setOwner(get(generalizedType, "BlockedType")!, c);

    propagateDeprecatedAttributeToConstraint(c.c, fn.func);

    addAllAsDependenciesAndChainReturns(start, end, this, c);
    const lookedUpTy = this.lookup(scope, fn.name.location, def);
    const existingFunctionTy = lookedUpTy ? follow(lookedUpTy) : undefined;

    if (fn.name instanceof AstExprLocal) {
      const localName = fn.name;
      this.visitLValueLocal(scope, localName, generalizedType);

      scope.bindings.set(localName.local, { typeId: sig.signature, location: localName.location });
      scope.lvalueTypes.set(def, sig.signature);
    } else if (fn.name instanceof AstExprGlobal) {
      const globalName = fn.name;
      if (!existingFunctionTy) throw new InternalCompilerError("prepopulateGlobalScope did not populate a global name");

      const bt = get(existingFunctionTy, "BlockedType");
      if (bt && this.uninitializedGlobals.has(globalName.name)) {
        this.uninitializedGlobals.delete(globalName.name);
        emplaceType(existingFunctionTy, boundType(generalizedType));
      }

      scope.bindings.set(globalName.name, { typeId: sig.signature, location: globalName.location });
      scope.lvalueTypes.set(def, sig.signature);
    } else if (fn.name instanceof AstExprIndexName) {
      this.visitLValueIndexName(scope, fn.name, generalizedType);
    } else if (fn.name instanceof AstExprError) {
      generalizedType = this.builtinTypes.errorType;
    }

    this.updateRValueRefinements(scope, def, generalizedType);

    return ControlFlow.None;
  }

  private visitReturn(scope: Scope, ret: AstStatReturn): ControlFlow {
    // The return type has interesting contents here only when the function
    // has an explicit return annotation, and then the returned expressions
    // are expected to conform to it.
    const expectedTypes: (TypeId | undefined)[] = [];
    for (const ty of flatten(scope.returnType).head) expectedTypes.push(ty);
    const exprTypes = this.checkPackList(scope, ret.list, expectedTypes, false).tp;
    this.addConstraint(scope, ret.location, { kind: "PackSubtypeConstraint", subPack: exprTypes, superPack: scope.returnType, returns: true });

    return ControlFlow.Returns;
  }

  private visitBlock(scope: Scope, block: AstStatBlock): ControlFlow {
    const innerScope = this.childScope(block, scope);

    const flow = this.visitBlockWithoutChildScope(innerScope, block);

    // A block has linear control flow, one entry and one exit, so every
    // change it makes to the environment carries over.
    scope.inheritRefinements(innerScope);
    scope.inheritAssignments(innerScope);

    return flow;
  }

  private visitAssign(scope: Scope, assign: AstStatAssign): ControlFlow {
    const resultPack = this.checkPackList(scope, assign.values, [], true).tp;

    const valueTypes: TypeId[] = [];

    const { head } = flatten(resultPack);
    if (head.length >= assign.vars.length) {
      // The result pack is long enough for every variable, so its types are
      // used directly, without an UnpackConstraint.
      for (let i = 0; i < assign.vars.length; ++i) valueTypes.push(head[i]!);
    } else {
      // How many types the right side produces is not known yet, so an
      // UnpackConstraint defers the split to the solver.
      for (let i = 0; i < assign.vars.length; ++i) valueTypes.push(this.arena.addType(blockedType()));

      const uc = this.addConstraint(scope, assign.location, { kind: "UnpackConstraint", resultPack: [...valueTypes], sourcePack: resultPack });

      for (const t of valueTypes) setOwner(get(t, "BlockedType")!, uc);
    }

    for (let i = 0; i < assign.vars.length; ++i) {
      this.visitLValue(scope, assign.vars[i]!, valueTypes[i]!);
    }

    return ControlFlow.None;
  }

  private visitCompoundAssign(scope: Scope, assign: AstStatCompoundAssign): ControlFlow {
    const resultTy = this.checkAstExprBinary(scope, assign.location, assign.op, assign.variable, assign.value, undefined).ty;
    this.module.astCompoundAssignResultTypes.set(assign, resultTy);
    // Compound assignments do not update lvalues, by design.
    return ControlFlow.None;
  }

  private visitIf(scope: Scope, ifStatement: AstStatIf): ControlFlow {
    const thenScope = this.childScope(ifStatement.thenbody, scope);
    const elseScope = this.childScope(ifStatement.elsebody ? ifStatement.elsebody : ifStatement, scope);

    const refinement = this.withTypeContext(TypeContext.Condition, () => this.check(scope, ifStatement.condition, undefined).refinement);

    this.applyRefinements(thenScope, ifStatement.condition.location, refinement);
    this.applyRefinements(elseScope, ifStatement.elseLocation ?? ifStatement.condition.location, this.refinementArena.negation(refinement));

    const thencf = this.visitBlock(thenScope, ifStatement.thenbody);
    let elsecf = ControlFlow.None;
    if (ifStatement.elsebody) elsecf = this.visitStat(elseScope, ifStatement.elsebody);

    if (thencf !== ControlFlow.None && elsecf === ControlFlow.None) scope.inheritRefinements(elseScope);
    else if (thencf === ControlFlow.None && elsecf !== ControlFlow.None) scope.inheritRefinements(thenScope);

    if (thencf === ControlFlow.None) scope.inheritAssignments(thenScope);
    if (elsecf === ControlFlow.None) scope.inheritAssignments(elseScope);

    if (thencf === elsecf) return thencf;
    else if (matches(thencf, ControlFlow.Returns | ControlFlow.Throws) && matches(elsecf, ControlFlow.Returns | ControlFlow.Throws)) {
      return ControlFlow.Returns;
    } else return ControlFlow.None;
  }

  private resolveGenericDefaultParameters(defnScope: Scope, alias: AstStatTypeAlias, fun: TypeFun): void {
    for (let i = 0; i < alias.generics.length; i++) {
      const astTy = alias.generics[i]!;
      const param = fun.typeParams[i]!;
      if (param.defaultValue && astTy.defaultValue !== undefined) {
        const resolvesTo = astTy.defaultValue;
        const toUnblock = param.defaultValue;
        emplaceType(toUnblock, boundType(this.resolveType(defnScope, resolvesTo, /* inTypeArguments */ false)));
      }
      defnScope.privateTypeBindings.set(astTy.name, new TypeFun(param.ty));
    }

    for (let i = 0; i < alias.genericPacks.length; i++) {
      const astPack = alias.genericPacks[i]!;
      const param = fun.typePackParams[i]!;
      if (param.defaultValue && astPack.defaultValue !== undefined) {
        const resolvesTo = astPack.defaultValue;
        const toUnblock = param.defaultValue;
        emplaceTypePack(toUnblock, boundTypePack(this.resolveTypePack(defnScope, resolvesTo, /* inTypeArguments */ false)));
      }
      defnScope.privateTypePackBindings.set(astPack.name, param.tp);
    }
  }

  private visitTypeAlias(scope: Scope, alias: AstStatTypeAlias): ControlFlow {
    if (alias.name === kParseNameError) return ControlFlow.None;

    if (alias.name === "typeof") {
      this.reportError(alias.location, { kind: "ReservedIdentifier", name: "typeof" });
      return ControlFlow.None;
    }

    scope.typeAliasLocations.set(alias.name, alias.location);
    scope.typeAliasNameLocations.set(alias.name, alias.nameLocation);

    const defnScopePtr = this.astTypeAliasDefiningScopes.get(alias);

    const typeBindings = alias.exported ? scope.exportedTypeBindings : scope.privateTypeBindings;

    // These are undefined when the alias is a duplicate definition, which is skipped.
    const binding = typeBindings.get(alias.name);
    if (binding === undefined || defnScopePtr === undefined) return ControlFlow.None;

    const defnScope = defnScopePtr;
    this.resolveGenericDefaultParameters(defnScope, alias, binding);

    const ty = this.resolveType(defnScope, alias.type, /* inTypeArguments */ false, /* replaceErrorWithFresh */ false);

    const aliasTy = binding.type;
    if (occursCheck(aliasTy, ty)) {
      emplaceType(aliasTy, boundType(this.builtinTypes.anyType));
      this.reportError(alias.nameLocation, { kind: "OccursCheckFailed" });
    } else emplaceType(aliasTy, boundType(ty));

    const typeParams: TypeId[] = [];
    for (const [, tyParam] of this.createGenerics(defnScope, alias.generics, /* useCache */ true, /* addTypes */ false)) typeParams.push(tyParam.ty);

    const typePackParams: TypePackId[] = [];
    for (const [, tpParam] of this.createGenericPacks(defnScope, alias.genericPacks, /* useCache */ true, /* addTypes */ false)) {
      typePackParams.push(tpParam.tp);
    }

    this.addConstraint(scope, alias.type.location, {
      kind: "NameConstraint",
      namedType: ty,
      name: alias.name,
      synthetic: false,
      typeParameters: typeParams,
      typePackParameters: typePackParams,
    });

    return ControlFlow.None;
  }

  /** Checks a type function's body in its type function environment. */
  private visitTypeFunction(scope: Scope, fn: AstStatTypeFunction): ControlFlow {
    if (fn.name === "typeof") this.reportError(fn.location, { kind: "ReservedIdentifier", name: "typeof" });

    const environmentScope = this.astTypeFunctionEnvironmentScopes.get(fn);
    if (!environmentScope) throw new InternalCompilerError("prototypeTypeDefinitions did not make a type function environment");

    const startCheckpoint = checkpoint(this);
    const sig = this.checkFunctionSignature(environmentScope, fn.body, /* expectedType */ undefined);

    // The function's scope is also a child of the scope it is declared in.
    scope.children.push(sig.signatureScope!);
    this.interiorFreeTypes.push({ types: [], typePacks: [] });
    this.checkFunctionBody(sig.bodyScope, fn.body);
    const endCheckpoint = checkpoint(this);

    const generalizedTy = this.arena.addType(blockedType());
    const gc = this.addConstraint(sig.signatureScope!, fn.location, {
      kind: "GeneralizationConstraint",
      generalizedType: generalizedTy,
      sourceType: sig.signature,
      maybeDeprecatedAttr: undefined,
      noGenerics: false,
    });

    const interior = this.interiorFreeTypes[this.interiorFreeTypes.length - 1]!;
    sig.signatureScope!.interiorFreeTypes = interior.types;
    sig.signatureScope!.interiorFreeTypePacks = interior.typePacks;

    setOwner(get(generalizedTy, "BlockedType")!, gc);
    this.interiorFreeTypes.pop();

    addAllAsDependenciesAndChainReturns(startCheckpoint, endCheckpoint, this, gc);
    const existingFunctionTy = environmentScope.lookup(fn.name);

    if (!existingFunctionTy) throw new InternalCompilerError("prototypeTypeDefinitions did not populate the type function name");

    const unpackedTy = follow(existingFunctionTy);

    const bt = get(unpackedTy, "BlockedType");
    if (bt && bt.owner === undefined) emplaceType(unpackedTy, boundType(generalizedTy));

    return ControlFlow.None;
  }

  private visitDeclareGlobal(scope: Scope, global: AstStatDeclareGlobal): ControlFlow {
    const globalTy = this.resolveType(scope, global.type, /* inTypeArguments */ false);
    const globalName = global.name;

    const rootScope = this.rootScope!;
    this.module.declaredGlobals.set(globalName, globalTy);
    rootScope.bindings.set(global.name, { typeId: globalTy, location: global.location });

    const def = this.dfg.getDeclaredDef(global);
    rootScope.lvalueTypes.set(def, globalTy);
    this.updateRValueRefinements(rootScope, def, globalTy);

    return ControlFlow.None;
  }

  private visitDeclareExternType(scope: Scope, declaredExternType: AstStatDeclareExternType): ControlFlow {
    // A declaration with no type binding, such as one without a name, is skipped.
    const binding = scope.exportedTypeBindings.get(declaredExternType.name);
    if (binding === undefined) return ControlFlow.None;

    let superTy: TypeId = this.builtinTypes.externType;
    if (declaredExternType.superName !== undefined) {
      const superName = declaredExternType.superName;
      const lookupType = scope.lookupType(superName);

      if (!lookupType) {
        this.reportError(declaredExternType.location, { kind: "UnknownSymbol", name: superName, context: UnknownSymbolContext.Type });
        return ControlFlow.None;
      }

      superTy = follow(lookupType.type);

      if (!get(follow(superTy), "ExternType")) {
        this.reportError(declaredExternType.location, {
          kind: "GenericError",
          message: `Cannot use non-class type '${superName}' as a superclass of class '${declaredExternType.name}'`,
        });

        // Without an error type here, a blocked type would be exposed in this
        // module's type interface.
        emplaceType(binding.type, boundType(this.builtinTypes.errorType));

        return ControlFlow.None;
      }
    }

    const className = declaredExternType.name;

    const externTy = this.arena.addType(
      externType(className, new Props(), {
        parent: superTy,
        metatable: undefined,
        definitionModuleName: this.module.name,
        definitionLocation: declaredExternType.location,
      }),
    );
    const etv = get(externTy, "ExternType")!;

    const metaTy = this.arena.addType(tableType({ state: TableState.Sealed, level: copyLevel(scope.level), scope }));
    const metatable = get(metaTy, "TableType")!;

    etv.metatable = metaTy;

    const classBindTy = binding.type;
    emplaceType(classBindTy, boundType(externTy));

    if (declaredExternType.indexer) {
      if (this.recursionCount >= CONSTRAINT_GENERATOR_RECURSION_LIMIT) {
        this.reportCodeTooComplex(declaredExternType.indexer.location);
      } else {
        // Extern types are not generic, but an indexer over generics has
        // mixed polarity.
        etv.indexer = new TableIndexer(
          this.resolveType(
            scope,
            declaredExternType.indexer.indexType,
            /* inTypeArguments */ false,
            /* replaceErrorWithFresh */ false,
            /* initialPolarity */ Polarity.Mixed,
          ),
          this.resolveType(
            scope,
            declaredExternType.indexer.resultType,
            /* inTypeArguments */ false,
            /* replaceErrorWithFresh */ false,
            /* initialPolarity */ Polarity.Mixed,
          ),
        );
      }
    }

    for (const externProp of declaredExternType.props) {
      const propName = externProp.name;
      const propTy = this.resolveType(
        scope,
        externProp.ty,
        /* inTypeArguments */ false,
        /* replaceErrorWithFresh */ false,
        /* initialPolarity */ Polarity.Mixed,
      );

      const assignToMetatable = isMetamethod(propName);

      // A method's type takes `self`, which its parsed annotation leaves out.
      if (externProp.isMethod) {
        const ftv = get(propTy, "FunctionType");
        if (ftv) {
          ftv.argNames.unshift({ name: "self", location: new Location() });
          ftv.argTypes = this.addTypePack([externTy], ftv.argTypes);

          ftv.hasSelf = true;

          // No vararg location is kept.
          const defn: FunctionDefinition = {
            definitionModuleName: this.module.name,
            definitionLocation: externProp.location,
            originalNameLocation: externProp.nameLocation,
          };

          ftv.definition = defn;
        }
      }

      const props = assignToMetatable ? metatable.props : etv.props;

      if (!props.has(propName)) {
        let tableProp: Property;

        if (externProp.access === AstTableAccess.Read) tableProp = Property.readonly(propTy);
        else if (externProp.access === AstTableAccess.Write) tableProp = Property.writeonly(propTy);
        else tableProp = Property.rw(propTy);

        tableProp.location = externProp.location;

        props.set(propName, tableProp);
      } else {
        const prop = props.get(propName)!;
        let addedWriteTypeByOverload = false;

        const readTy = prop.readTy;
        if (readTy) {
          // Overloads keep the intersection flat instead of nesting intersections.
          const itv = get(readTy, "IntersectionType");
          if (itv) {
            const options = [...itv.parts];
            options.push(propTy);
            const newItv = this.arena.addType(intersectionType(options));

            prop.readTy = newItv;
          } else if (get(readTy, "FunctionType")) {
            const intersection = this.arena.addType(intersectionType([readTy, propTy]));

            prop.readTy = intersection;
          } else if (externProp.access === AstTableAccess.Write && prop.writeTy === undefined) {
            prop.writeTy = propTy;
            addedWriteTypeByOverload = true;
          } else {
            this.reportError(declaredExternType.location, {
              kind: "GenericError",
              message: `Cannot overload read type of non-function extern type member '${propName}'`,
            });
          }
        }

        const writeTy = prop.writeTy;
        if (writeTy && !addedWriteTypeByOverload) {
          // Overloads keep the intersection flat instead of nesting intersections.
          const itv = get(writeTy, "IntersectionType");
          if (itv) {
            const options = [...itv.parts];
            options.push(propTy);
            const newItv = this.arena.addType(intersectionType(options));

            prop.writeTy = newItv;
          } else if (get(writeTy, "FunctionType")) {
            const intersection = this.arena.addType(intersectionType([writeTy, propTy]));

            prop.writeTy = intersection;
          } else if (externProp.access === AstTableAccess.Read && prop.readTy === undefined) {
            prop.readTy = propTy;
          } else {
            this.reportError(declaredExternType.location, {
              kind: "GenericError",
              message: `Cannot overload write type of non-function extern type member '${propName}'`,
            });
          }
        }
      }
    }

    return ControlFlow.None;
  }

  private visitDeclareFunction(scope: Scope, global: AstStatDeclareFunction): ControlFlow {
    const generics = this.createGenerics(scope, global.generics);
    const genericPacks = this.createGenericPacks(scope, global.genericPacks);

    const genericTys: TypeId[] = [];
    for (const [, generic] of generics) genericTys.push(generic.ty);

    const genericTps: TypePackId[] = [];
    for (const [, generic] of genericPacks) genericTps.push(generic.tp);

    let funScope = scope;
    if (generics.length !== 0 || genericPacks.length !== 0) funScope = this.childScope(global, scope);

    const paramPack = this.resolveTypePackList(
      funScope,
      global.params,
      /* inTypeArguments */ false,
      /* replaceErrorWithFresh */ false,
      /* initialPolarity */ Polarity.Negative,
    );
    const retPack = this.resolveTypePack(
      funScope,
      global.retTypes,
      /* inTypeArguments */ false,
      /* replaceErrorWithFresh */ false,
      /* initialPolarity */ Polarity.Positive,
    );

    const defn: FunctionDefinition = {
      definitionModuleName: this.module.name,
      definitionLocation: global.location,
      varargLocation: global.vararg ? global.varargLocation : undefined,
      originalNameLocation: global.nameLocation,
    };

    const fnType = this.arena.addType(functionType(paramPack, retPack, { generics: genericTys, genericPacks: genericTps, definition: defn }));

    const ftv = get(fnType, "FunctionType")!;
    ftv.isCheckedFunction = global.isCheckedFunction();
    const deprecatedAttr = getAttribute(global.attributes, AstAttrType.Deprecated);
    ftv.isDeprecatedFunction = deprecatedAttr !== undefined;

    for (const el of global.paramNames) ftv.argNames.push({ name: el.name, location: el.location });
    const fnName = global.name;

    this.module.declaredGlobals.set(fnName, fnType);
    scope.bindings.set(global.name, { typeId: fnType, location: global.location });

    const rootScope = this.rootScope!;
    const def = this.dfg.getDeclaredDef(global);
    rootScope.lvalueTypes.set(def, fnType);
    this.updateRValueRefinements(rootScope, def, fnType);

    return ControlFlow.None;
  }

  private visitError(scope: Scope, error: AstStatError): ControlFlow {
    for (const stat of error.statements) this.visitStat(scope, stat);
    for (const expr of error.expressions) this.check(scope, expr);

    return ControlFlow.None;
  }

  /** Runs `f` with the type context set to `newValue`, then restores it (Luau's `InConditionalContext`). */
  private withTypeContext<T>(newValue: TypeContext, f: () => T): T {
    const oldValue = this.typeContext;
    this.typeContext = newValue;
    try {
      return f();
    } finally {
      this.typeContext = oldValue;
    }
  }

  private checkPackList(scope: Scope, exprs: AstExpr[], expectedTypes: (TypeId | undefined)[], generalize: boolean): InferencePack {
    const head: TypeId[] = [];
    let tail: TypePackId | undefined;

    for (let i = 0; i < exprs.length; ++i) {
      const expr = exprs[i]!;
      if (i < exprs.length - 1) {
        let expectedType: TypeId | undefined;
        if (i < expectedTypes.length) expectedType = expectedTypes[i];
        head.push(this.check(scope, expr, expectedType, /* forceSingleton */ false, generalize).ty);
      } else {
        let expectedTailTypes: (TypeId | undefined)[] = [];
        if (i < expectedTypes.length) expectedTailTypes = expectedTypes.slice(i);
        tail = this.checkPack(scope, expr, expectedTailTypes, generalize).tp;
      }
    }

    return inferencePack(this.addTypePack(head, tail));
  }

  private checkPack(scope: Scope, expr: AstExpr, expectedTypes: (TypeId | undefined)[] = [], generalize = true): InferencePack {
    this.recursionCount++;
    try {
      if (this.recursionCount >= CONSTRAINT_GENERATOR_RECURSION_LIMIT) {
        this.reportCodeTooComplex(expr.location);
        return inferencePack(this.builtinTypes.errorTypePack);
      }

      let result: InferencePack;

      if (expr instanceof AstExprCall) {
        if (expectedTypes.length !== 0 && matchSetMetatable(expr)) result = this.checkPackCall(scope, expr, expectedTypes[0]);
        else result = this.checkPackCall(scope, expr);
      } else if (expr instanceof AstExprVarargs) {
        if (scope.varargPack) result = inferencePack(scope.varargPack);
        else result = inferencePack(this.builtinTypes.errorTypePack);
      } else {
        let expectedType: TypeId | undefined;
        if (expectedTypes.length !== 0) expectedType = expectedTypes[0];
        // With an expected type, the lambdas in the expression keep their
        // ungeneralized types; without one, `generalize` decides.
        const t = this.check(scope, expr, expectedType, /* forceSingleton */ false, expectedType === undefined && generalize).ty;

        result = inferencePack(this.arena.addTypePack([t]));
      }

      this.module.astTypePacks.set(expr, result.tp);
      return result;
    } finally {
      this.recursionCount--;
    }
  }

  private checkPackCall(scope: Scope, call: AstExprCall, expectedType?: TypeId): InferencePack {
    const funcBeginCheckpoint = checkpoint(this);

    const fnType = this.withTypeContext(TypeContext.Default, () => this.check(scope, call.func).ty);

    const funcEndCheckpoint = checkpoint(this);

    return this.checkExprCall(scope, call, fnType, funcBeginCheckpoint, funcEndCheckpoint, expectedType);
  }

  private checkExprCall(
    scope: Scope,
    call: AstExprCall,
    fnType: TypeId,
    funcBeginCheckpoint: Checkpoint,
    funcEndCheckpoint: Checkpoint,
    expectedType: TypeId | undefined,
  ): InferencePack {
    const exprArgs: AstExpr[] = [];

    const returnRefinements: RefinementId[] = [];
    const discriminantTypes: (TypeId | undefined)[] = [];

    if (call.self) {
      const indexExpr = call.func instanceof AstExprIndexName ? call.func : undefined;
      if (!indexExpr) throw new InternalCompilerError("method call expression has no 'self'");

      exprArgs.push(indexExpr.expr);

      const key = this.dfg.getRefinementKey(indexExpr.expr);
      if (key) {
        const discriminantTy = this.arena.addType(blockedType());
        returnRefinements.push(this.refinementArena.implicitProposition(key, discriminantTy));
        discriminantTypes.push(discriminantTy);
      } else discriminantTypes.push(undefined);
    }

    for (const arg of call.args) {
      exprArgs.push(arg);

      const key = this.dfg.getRefinementKey(arg);
      if (key) {
        const discriminantTy = this.arena.addType(blockedType());
        returnRefinements.push(this.refinementArena.implicitProposition(key, discriminantTy));
        discriminantTypes.push(discriminantTy);
      } else discriminantTypes.push(undefined);
    }

    let expectedTypesForCall = this.getExpectedCallTypesForFunctionOverloads(fnType);

    if (matchSetMetatable(call) && expectedType) {
      const expectedMetatable = get(follow(expectedType), "MetatableType");
      if (expectedMetatable) expectedTypesForCall = [expectedMetatable.table, expectedMetatable.metatable];
    }

    this.module.astOriginalCallTypes.set(call.func, fnType);

    const argBeginCheckpoint = checkpoint(this);

    const args: TypeId[] = [];
    let argTail: TypePackId | undefined;
    const argumentRefinements: (RefinementId | undefined)[] = [];

    // `setmetatable` constructs a `MetatableType` directly instead of
    // resolving a call, as in
    //
    //  local a = setmetatable({ a = 1 }, {
    //      __call = function(self, b: number)
    //          return self.a * b
    //      end,
    //  })
    //  local foo = a(12)
    //
    // Lambdas in a call's arguments are open to bidirectional inference, but
    // they must also be generalized at the right time; without an expected
    // type, `setmetatable` never checks its arguments against anything, so
    // the lambdas in its arguments are let-generalized.
    let generalize = matchSetMetatable(call);
    if (matchSetMetatable(call)) {
      if (expectedType) generalize = false;
    }

    for (let i = 0; i < exprArgs.length; ++i) {
      const arg = exprArgs[i]!;

      if (i === 0 && call.self) {
        // The self type was computed along with the function type; unless
        // that exceeded a recursion limit, it is in `astTypes`.
        const selfTy = this.module.astTypes.get(exprArgs[0]!);
        if (selfTy) args.push(selfTy);
        else args.push(this.freshType(scope, Polarity.Negative));
      } else if (i < exprArgs.length - 1 || !(arg instanceof AstExprCall || arg instanceof AstExprVarargs)) {
        let argExpectedType: TypeId | undefined = undefined;
        if (i < expectedTypesForCall.length) {
          argExpectedType = expectedTypesForCall[i];
        }

        if (i === 0 && matchAssert(call)) {
          const { ty, refinement } = this.withTypeContext(TypeContext.Condition, () =>
            this.check(scope, arg, argExpectedType, /* forceSingleton */ false, generalize),
          );
          args.push(ty);
          argumentRefinements.push(refinement);
        } else {
          const { ty, refinement } = this.check(scope, arg, argExpectedType, /* forceSingleton */ false, generalize);
          args.push(ty);
          argumentRefinements.push(refinement);
        }
      } else {
        let expectedTypes: (TypeId | undefined)[] = [];
        if (i < expectedTypesForCall.length) {
          expectedTypes = expectedTypesForCall.slice(i);
        }
        const { tp, refinements: refis } = this.checkPack(scope, arg, expectedTypes);
        argTail = tp;
        argumentRefinements.push(...refis);
      }
    }

    const argEndCheckpoint = checkpoint(this);

    if (matchSetMetatable(call)) {
      let argTailPack: TypePack = typePack([]);
      if (argTail && args.length < 2) argTailPack = extendTypePack(this.arena, this.builtinTypes, argTail, 2 - args.length);

      let target: TypeId;
      let mt: TypeId;

      if (args.length + argTailPack.head.length === 2) {
        target = args.length > 0 ? args[0]! : argTailPack.head[0]!;
        mt = args.length > 1 ? args[1]! : argTailPack.head[args.length === 0 ? 1 : 0]!;
      } else {
        const unpackedTypes: TypeId[] = [];
        if (args.length > 0) target = follow(args[0]!);
        else {
          target = this.arena.addType(blockedType());
          unpackedTypes.push(target);
        }

        mt = this.arena.addType(blockedType());
        unpackedTypes.push(mt);

        const c = this.addConstraint(scope, call.location, { kind: "UnpackConstraint", resultPack: unpackedTypes, sourcePack: argTail! });
        setOwner(get(mt, "BlockedType")!, c);
        const b = get(target, "BlockedType");
        if (b && b.owner === undefined) setOwner(b, c);
      }

      target = follow(target);

      const targetExpr = call.args[0]!;

      let resultTy: TypeId;

      if (isTableUnion(target)) {
        const targetUnion = get(target, "UnionType")!;
        const ub = new UnionBuilder(this.arena, this.builtinTypes);

        for (const ty of flatOptions(targetUnion)) ub.add(this.arena.addType(metatableType(findSetmetatableTargetOf(ty), mt)));

        resultTy = ub.build();
      } else resultTy = this.arena.addType(metatableType(findSetmetatableTargetOf(target), mt));

      this.module.astTypes.set(call, resultTy);

      if (expectedType) {
        const ptc = this.addConstraint(scope, call.location, {
          kind: "PushTypeConstraint",
          expectedType,
          targetType: resultTy,
          astTypes: this.module.astTypes,
          astExpectedTypes: this.module.astExpectedTypes,
          expr: call,
        });

        addAllAsReverseDependencies(argBeginCheckpoint, argEndCheckpoint, this, ptc);
      }

      if (targetExpr instanceof AstExprLocal) {
        const targetLocal = targetExpr;
        let binding = scope.bindings.get(targetLocal.local);
        if (!binding) {
          binding = { typeId: resultTy, location: new Location() };
          scope.bindings.set(targetLocal.local, binding);
        }
        binding.typeId = resultTy;

        const def = this.dfg.getDef(targetLocal);
        scope.lvalueTypes.set(def, resultTy);
        this.updateRValueRefinements(scope, def, resultTy);

        // The target local is already in `inferredBindings`; its old type is
        // swapped for the result, so that the local's type is not a union
        // like `tbl | { @metatable something, tbl }`.
        const ib = this.inferredBindings.get(targetLocal.local);
        if (ib) ib.types.erase(target);

        this.recordInferredBinding(targetLocal.local, resultTy);
      }

      return inferencePack(this.arena.addTypePack([resultTy]), [this.refinementArena.variadic(returnRefinements)]);
    }

    if (shouldTypestateForFirstArgument(call) && call.args.length > 0 && isLValue(call.args[0]!)) {
      const targetExpr = call.args[0]!;
      const resultTy = this.arena.addType(blockedType());

      const def = this.dfg.getDefOptional(targetExpr);
      if (def) {
        scope.lvalueTypes.set(def, resultTy);
        this.updateRValueRefinements(scope, def, resultTy);
      }
    }

    if (matchAssert(call) && argumentRefinements.length !== 0) this.applyRefinements(scope, call.args[0]!.location, argumentRefinements[0]);

    const rets = this.arena.addTypePack(blockedTypePack());
    const argPack = this.addTypePack(args, argTail);

    const [explicitTypeIds, explicitTypePackIds]: [TypeId[], TypePackId[]] =
      call.typeArguments.length !== 0 ? this.resolveTypeArguments(scope, call.typeArguments) : [[], []];

    // For bidirectional inference, the constraints are solved in this order:
    // the function type; the propagation of its types to the argument types;
    // the argument types; the call.

    const checkConstraint = this.addConstraint(scope, call.func.location, {
      kind: "FunctionCheckConstraint",
      fn: fnType,
      argsPack: argPack,
      callSite: call,
      astTypes: this.module.astTypes,
      astExpectedTypes: this.module.astExpectedTypes,
    });

    addAllAsDependencies(funcBeginCheckpoint, funcEndCheckpoint, this, checkConstraint);

    const callConstraint = this.addConstraint(scope, call.func.location, {
      kind: "FunctionCallConstraint",
      fn: fnType,
      argsPack: argPack,
      result: rets,
      callSite: call,
      discriminantTypes,
      typeArguments: explicitTypeIds,
      typePackArguments: explicitTypePackIds,
      astTypes: this.module.astTypes,
      astOverloadResolvedTypes: this.module.astOverloadResolvedTypes,
    });

    getPack(rets, "BlockedTypePack")!.owner = callConstraint;

    this.cgraph.addDependencyOf(checkConstraint, callConstraint);
    forEachConstraint(argBeginCheckpoint, argEndCheckpoint, this, (constraint) => {
      this.cgraph.addDependencyOf(checkConstraint, constraint);
      this.cgraph.addDependencyOf(constraint, callConstraint);
    });

    return inferencePack(rets, [this.refinementArena.variadic(returnRefinements)]);
  }

  /**
   * Checks an expression that is expected to evaluate to one type.
   * @param scope the scope the expression is in.
   * @param expr the expression to check.
   * @param expectedType the type the surrounding context expects, for bidirectional inference.
   * @param generalize whether to generalize the lambdas met.
   * @returns the type of the expression.
   */
  private check(scope: Scope, expr: AstExpr, expectedType?: TypeId, forceSingleton = false, generalize = true): Inference {
    this.recursionCount++;
    try {
      if (this.recursionCount >= CONSTRAINT_GENERATOR_RECURSION_LIMIT) {
        this.reportCodeTooComplex(expr.location);
        return inference(this.builtinTypes.errorType);
      }

      // An expression can be checked more than once, as in the compound
      // assignment `a[b] += c`; its result is cached so that `b` gets one set
      // of constraints.
      const cached = this.inferredExprCache.get(expr);
      if (cached) return cached;

      let result: Inference;

      if (expr instanceof AstExprGroup) result = this.check(scope, expr.expr, expectedType, forceSingleton, generalize);
      else if (expr instanceof AstExprConstantString) result = this.checkConstantString(scope, expr, expectedType, forceSingleton);
      else if (expr instanceof AstExprConstantNumber) result = inference(this.builtinTypes.numberType);
      else if (expr instanceof AstExprConstantBool) result = this.checkConstantBool(scope, expr, expectedType, forceSingleton);
      else if (expr instanceof AstExprConstantNil) result = inference(this.builtinTypes.nilType);
      else if (expr instanceof AstExprLocal) result = this.checkLocal(scope, expr);
      else if (expr instanceof AstExprGlobal) result = this.checkGlobal(scope, expr);
      else if (expr instanceof AstExprVarargs) result = this.flattenPack(scope, expr.location, this.checkPack(scope, expr));
      else if (expr instanceof AstExprCall) {
        result = this.flattenPack(scope, expr.location, this.checkPackCall(scope, expr, matchSetMetatable(expr) ? expectedType : undefined));
      } else if (expr instanceof AstExprFunction) result = this.checkFunction(scope, expr, expectedType, generalize);
      else if (expr instanceof AstExprIndexName) result = this.checkIndexNameExpr(scope, expr);
      else if (expr instanceof AstExprIndexExpr) result = this.checkIndexExpr(scope, expr);
      else if (expr instanceof AstExprTable) result = this.checkTable(scope, expr, expectedType, generalize);
      else if (expr instanceof AstExprUnary) result = this.checkUnary(scope, expr);
      else if (expr instanceof AstExprBinary) result = this.checkBinaryExpr(scope, expr, expectedType);
      else if (expr instanceof AstExprIfElse) result = this.checkIfElse(scope, expr, expectedType);
      else if (expr instanceof AstExprTypeAssertion) result = this.checkTypeAssertion(scope, expr);
      else if (expr instanceof AstExprInterpString) result = this.checkInterpString(scope, expr);
      else if (expr instanceof AstExprInstantiate) result = this.checkInstantiate(scope, expr);
      else if (expr instanceof AstExprError) {
        for (const subExpr of expr.expressions) this.check(scope, subExpr);

        result = inference(this.builtinTypes.errorType);
      } else if (sparkdownValue(expr)) {
        // Not part of Luau: one of Sparkdown's own expressions (`SparkdownReading.ts`).
        const value = sparkdownValue(expr)!;
        for (const operand of value.operands) this.check(scope, operand);
        result = inference(value.type === "string" ? this.builtinTypes.stringType : this.builtinTypes.anyType);
      } else {
        result = inference(this.freshType(scope));
      }

      this.inferredExprCache.set(expr, result);

      this.module.astTypes.set(expr, result.ty);
      if (expectedType) this.module.astExpectedTypes.set(expr, expectedType);
      return result;
    } finally {
      this.recursionCount--;
    }
  }

  private checkConstantString(scope: Scope, string: AstExprConstantString, expectedType: TypeId | undefined, forceSingleton: boolean): Inference {
    if (forceSingleton) return inference(this.arena.addType(stringSingleton(string.value)));

    // A table like `{ "aback", "abacus", "abandon", ... }` is most likely
    // meant as a `{ string }`, not an array of a huge union of singletons.
    if (this.largeTableDepth > 0) return inference(this.builtinTypes.stringType);

    const freeTy = this.freshType(scope, Polarity.Positive);
    const ft = get(freeTy, "FreeType")!;
    ft.lowerBound = this.arena.addType(stringSingleton(string.value));
    ft.upperBound = this.builtinTypes.stringType;
    ft.primitiveType = this.builtinTypes.stringType;
    if (expectedType) this.addConstraint(scope, string.location, { kind: "SubtypeConstraint", subType: freeTy, superType: expectedType });
    return inference(freeTy);
  }

  private checkConstantBool(scope: Scope, boolExpr: AstExprConstantBool, expectedType: TypeId | undefined, forceSingleton: boolean): Inference {
    const singletonType = boolExpr.value ? this.builtinTypes.trueType : this.builtinTypes.falseType;
    if (forceSingleton) return inference(singletonType);

    // A table like `{ Foo = true, Bar = false, Baz = true, ... }` is most
    // likely meant to hold booleans, not a singleton in each property.
    if (this.largeTableDepth > 0) return inference(this.builtinTypes.booleanType);

    const freeTy = this.freshType(scope, Polarity.Positive);
    const ft = get(freeTy, "FreeType")!;
    ft.lowerBound = singletonType;
    ft.upperBound = this.builtinTypes.booleanType;
    ft.primitiveType = this.builtinTypes.booleanType;
    if (expectedType) this.addConstraint(scope, boolExpr.location, { kind: "SubtypeConstraint", subType: freeTy, superType: expectedType });
    return inference(freeTy);
  }

  private checkLocal(scope: Scope, local: AstExprLocal): Inference {
    const key = this.dfg.getRefinementKey(local);

    let maybeTy: TypeId | undefined;

    // A refinement key gives the local's type.
    if (key) maybeTy = this.lookup(scope, local.location, key.def);

    if (maybeTy) {
      const ty = follow(maybeTy);

      this.recordInferredBinding(local.local, ty);

      return inference(ty, this.refinementArena.proposition(key, this.builtinTypes.truthyType));
    } else throw new InternalCompilerError("CG: AstExprLocal came before its declaration?");
  }

  private checkGlobal(scope: Scope, global: AstExprGlobal): Inference {
    const key = this.dfg.getRefinementKey(global)!;

    const def = key.def;

    // `prepopulateGlobalScope` has added every global function to the
    // environment, so a global that is not in scope is an unknown symbol.
    const ty = this.lookup(scope, global.location, def, /* prototype */ false);
    if (ty) {
      return inference(ty, this.refinementArena.proposition(key, this.builtinTypes.truthyType));
    } else return inference(this.builtinTypes.errorType);
  }

  private checkIndexName(scope: Scope, key: RefinementKey | undefined, indexee: AstExpr, index: string, indexLocation: Location): Inference {
    const obj = this.check(scope, indexee).ty;
    let result: TypeId | undefined;

    // The HasProp constraint is optimized away in simple cases, to reason
    // about updates to unsealed tables more accurately.

    let tt = getTableType(obj);

    // If the local's domain grows at all, it grows somewhere after this
    // position in the script.
    if (!tt) {
      const localDomain = this.localTypes.get(obj);
      if (localDomain && 1 === localDomain.size) tt = getTableType(localDomain.front());
    }

    if (tt) {
      const it = tt.props.get(index);
      if (it && it.readTy !== undefined) result = it.readTy;
    }

    const cachedHasPropResult = this.propIndexPairsSeen.get(propIndexPairKey(obj, index));
    if (cachedHasPropResult) result = cachedHasPropResult;

    if (!result) {
      const blockedResult = this.arena.addType(blockedType());
      result = blockedResult;

      const c = this.addConstraint(scope, indexee.location, {
        kind: "HasPropConstraint",
        resultType: blockedResult,
        subjectType: obj,
        prop: index,
        context: ValueContext.RValue,
        inConditional: inConditional(this.typeContext),
        suppressSimplification: false,
      });
      setOwner(get(blockedResult, "BlockedType")!, c);
      this.propIndexPairsSeen.set(propIndexPairKey(obj, index), blockedResult);
    }

    if (key) {
      const ty = this.lookup(scope, indexLocation, key.def, false);
      if (ty) return inference(ty, this.refinementArena.proposition(key, this.builtinTypes.truthyType));

      this.updateRValueRefinements(scope, key.def, result);
    }

    if (key) return inference(result, this.refinementArena.proposition(key, this.builtinTypes.truthyType));
    else return inference(result);
  }

  private checkIndexNameExpr(scope: Scope, indexName: AstExprIndexName): Inference {
    const key = this.dfg.getRefinementKey(indexName);
    return this.checkIndexName(scope, key, indexName.expr, indexName.index, indexName.indexLocation);
  }

  private checkIndexExpr(scope: Scope, indexExpr: AstExprIndexExpr): Inference {
    if (indexExpr.index instanceof AstExprConstantString) {
      const constantString = indexExpr.index;
      this.module.astTypes.set(indexExpr.index, this.builtinTypes.stringType);
      const key = this.dfg.getRefinementKey(indexExpr);
      return this.checkIndexName(scope, key, indexExpr.expr, cString(constantString.value), indexExpr.location);
    }

    const obj = this.check(scope, indexExpr.expr).ty;
    const indexType = this.check(scope, indexExpr.index).ty;

    const result = this.arena.addType(blockedType());

    const key = this.dfg.getRefinementKey(indexExpr);
    if (key) {
      const ty = this.lookup(scope, indexExpr.location, key.def);
      if (ty) return inference(ty, this.refinementArena.proposition(key, this.builtinTypes.truthyType));
      this.updateRValueRefinements(scope, key.def, result);
    }

    const c = this.addConstraint(scope, indexExpr.expr.location, { kind: "HasIndexerConstraint", resultType: result, subjectType: obj, indexType });
    setOwner(get(result, "BlockedType")!, c);

    if (key) return inference(result, this.refinementArena.proposition(key, this.builtinTypes.truthyType));
    else return inference(result);
  }

  private checkFunction(scope: Scope, func: AstExprFunction, expectedType: TypeId | undefined, generalize: boolean): Inference {
    return this.withTypeContext(TypeContext.Default, () => {
      const startCheckpoint = checkpoint(this);
      const sig = this.checkFunctionSignature(scope, func, expectedType);

      this.interiorFreeTypes.push({ types: [], typePacks: [] });
      this.checkFunctionBody(sig.bodyScope, func);
      const endCheckpoint = checkpoint(this);

      const generalizedTy = this.arena.addType(blockedType());
      const gc = this.addConstraint(sig.signatureScope!, func.location, {
        kind: "GeneralizationConstraint",
        generalizedType: generalizedTy,
        sourceType: sig.signature,
        maybeDeprecatedAttr: undefined,
        noGenerics: false,
      });

      propagateDeprecatedAttributeToConstraint(gc.c, func);

      const interior = this.interiorFreeTypes[this.interiorFreeTypes.length - 1]!;
      sig.signatureScope!.interiorFreeTypes = interior.types;
      sig.signatureScope!.interiorFreeTypePacks = interior.typePacks;
      this.interiorFreeTypes.pop();

      setOwner(get(generalizedTy, "BlockedType")!, gc);

      addAllAsDependenciesAndChainReturns(startCheckpoint, endCheckpoint, this, gc);
      if (generalize && hasFreeType(sig.signature)) {
        return inference(generalizedTy);
      } else {
        return inference(sig.signature);
      }
    });
  }

  private checkUnary(scope: Scope, unary: AstExprUnary): Inference {
    const oldTypeContext = this.typeContext;
    if (unary.op !== UnaryOp.Not) this.typeContext = TypeContext.Default;
    try {
      const { ty: operandType, refinement } = this.check(scope, unary.expr);

      switch (unary.op) {
        case UnaryOp.Not: {
          const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.notFunc, [operandType], [], scope, unary.location);
          return inference(resultType, this.refinementArena.negation(refinement));
        }
        case UnaryOp.Len: {
          const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.lenFunc, [operandType], [], scope, unary.location);
          return inference(resultType, refinement);
        }
        case UnaryOp.Minus: {
          const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.unmFunc, [operandType], [], scope, unary.location);
          return inference(resultType, refinement);
        }
        default:
          throw new InternalCompilerError("Unknown unary operator");
      }
    } finally {
      this.typeContext = oldTypeContext;
    }
  }

  private checkBinaryExpr(scope: Scope, binary: AstExprBinary, expectedType: TypeId | undefined): Inference {
    return this.checkAstExprBinary(scope, binary.location, binary.op, binary.left, binary.right, expectedType);
  }

  private checkAstExprBinary(
    scope: Scope,
    location: Location,
    op: BinaryOp,
    left: AstExpr,
    right: AstExpr,
    expectedType: TypeId | undefined,
  ): Inference {
    const [leftType, rightType, refinement] = this.checkBinary(scope, op, left, right, expectedType);

    switch (op) {
      case BinaryOp.Add: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.addFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.Sub: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.subFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.Mul: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.mulFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.Div: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.divFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.FloorDiv: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.idivFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.Pow: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.powFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.Mod: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.modFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.Concat: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.concatFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.And: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.andFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.Or: {
        const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.orFunc, [leftType, rightType], [], scope, location);
        return inference(resultType, refinement);
      }
      case BinaryOp.CompareLt: {
        this.addConstraint(scope, location, { kind: "EqualityConstraint", resultType: leftType, assignmentType: rightType });
        return inference(this.builtinTypes.booleanType, refinement);
      }
      case BinaryOp.CompareGe: {
        this.addConstraint(scope, location, { kind: "EqualityConstraint", resultType: leftType, assignmentType: rightType });
        return inference(this.builtinTypes.booleanType, refinement);
      }
      case BinaryOp.CompareLe: {
        this.addConstraint(scope, location, { kind: "EqualityConstraint", resultType: leftType, assignmentType: rightType });
        return inference(this.builtinTypes.booleanType, refinement);
      }
      case BinaryOp.CompareGt: {
        this.addConstraint(scope, location, { kind: "EqualityConstraint", resultType: leftType, assignmentType: rightType });
        return inference(this.builtinTypes.booleanType, refinement);
      }
      case BinaryOp.CompareEq:
      case BinaryOp.CompareNe:
        return inference(this.builtinTypes.booleanType, refinement);
      default:
        throw new InternalCompilerError("Op__Count should never be generated in an AST.");
    }
  }

  private checkIfElse(scope: Scope, ifElse: AstExprIfElse, expectedType: TypeId | undefined): Inference {
    return this.withTypeContext(TypeContext.Default, () => {
      const refinement = this.withTypeContext(TypeContext.Condition, () => {
        const condScope = this.childScope(ifElse.condition, scope);
        return this.check(condScope, ifElse.condition).refinement;
      });

      const thenScope = this.childScope(ifElse.trueExpr, scope);
      this.applyRefinements(thenScope, ifElse.trueExpr.location, refinement);
      const thenType = this.check(thenScope, ifElse.trueExpr, expectedType).ty;

      const elseScope = this.childScope(ifElse.falseExpr, scope);
      this.applyRefinements(elseScope, ifElse.falseExpr.location, this.refinementArena.negation(refinement));
      const elseType = this.check(elseScope, ifElse.falseExpr, expectedType).ty;

      return inference(this.makeUnion(scope, ifElse.location, thenType, elseType));
    });
  }

  private checkTypeAssertion(scope: Scope, typeAssert: AstExprTypeAssertion): Inference {
    this.check(scope, typeAssert.expr, undefined);
    return inference(this.resolveType(scope, typeAssert.annotation, /* inTypeArguments */ false));
  }

  private checkInterpString(scope: Scope, interpString: AstExprInterpString): Inference {
    return this.withTypeContext(TypeContext.Default, () => {
      for (const expr of interpString.expressions) this.check(scope, expr);

      return inference(this.builtinTypes.stringType);
    });
  }

  private checkInstantiate(scope: Scope, explicitTypeInstantiation: AstExprInstantiate): Inference {
    const functionType = this.check(scope, explicitTypeInstantiation.expr, undefined).ty;

    const [explicitTypeIds, explicitTypePackIds] = this.resolveTypeArguments(scope, explicitTypeInstantiation.typeArguments);

    const placeholderType = this.arena.addType(blockedType());

    const constraint = this.addConstraint(scope, explicitTypeInstantiation.location, {
      kind: "TypeInstantiationConstraint",
      functionType,
      placeholderType,
      typeArguments: explicitTypeIds,
      typePackArguments: explicitTypePackIds,
    });

    setOwner(get(placeholderType, "BlockedType")!, constraint);

    return inference(placeholderType);
  }

  private resolveTypeArguments(scope: Scope, typeArguments: AstTypeOrPack[]): [TypeId[], TypePackId[]] {
    const resolvedTypeArguments: TypeId[] = [];
    const resolvedTypePackArguments: TypePackId[] = [];

    for (const typeOrPack of typeArguments) {
      if (typeOrPack.type) {
        resolvedTypeArguments.push(this.resolveType(scope, typeOrPack.type, /* inTypeArguments */ false));
      } else {
        resolvedTypePackArguments.push(this.resolveTypePack(scope, typeOrPack.typePack!, /* inTypeArguments */ false));
      }
    }

    return [resolvedTypeArguments, resolvedTypePackArguments];
  }

  private checkBinary(
    scope: Scope,
    op: BinaryOp,
    left: AstExpr,
    right: AstExpr,
    expectedType: TypeId | undefined,
  ): [TypeId, TypeId, RefinementId | undefined] {
    const oldTypeContext = this.typeContext;
    if (op !== BinaryOp.And && op !== BinaryOp.Or && op !== BinaryOp.CompareEq && op !== BinaryOp.CompareNe) {
      this.typeContext = TypeContext.Default;
    }
    try {
      if (op === BinaryOp.And) {
        let relaxedExpectedLhs: TypeId | undefined;

        if (expectedType) relaxedExpectedLhs = this.arena.addType(unionType([this.builtinTypes.falsyType, expectedType]));

        const { ty: leftType, refinement: leftRefinement } = this.check(scope, left, relaxedExpectedLhs);

        const rightScope = this.childScope(right, scope);
        this.applyRefinements(rightScope, right.location, leftRefinement);
        const { ty: rightType, refinement: rightRefinement } = this.check(rightScope, right, expectedType);

        return [leftType, rightType, this.refinementArena.conjunction(leftRefinement, rightRefinement)];
      } else if (op === BinaryOp.Or) {
        let relaxedExpectedLhs: TypeId | undefined;

        if (expectedType) relaxedExpectedLhs = this.arena.addType(unionType([this.builtinTypes.falsyType, expectedType]));

        const { ty: leftType, refinement: leftRefinement } = this.check(scope, left, relaxedExpectedLhs);

        const rightScope = this.childScope(right, scope);
        this.applyRefinements(rightScope, right.location, this.refinementArena.negation(leftRefinement));
        const { ty: rightType, refinement: rightRefinement } = this.check(rightScope, right, expectedType);

        return [leftType, rightType, this.refinementArena.disjunction(leftRefinement, rightRefinement)];
      }

      const typeguard = matchTypeGuard(op, left, right);
      if (typeguard) {
        const leftType = this.check(scope, left).ty;
        const rightType = this.check(scope, right).ty;

        const key = this.dfg.getRefinementKey(typeguard.target);
        if (!key) return [leftType, rightType, undefined];

        let discriminantTy = this.builtinTypes.neverType;
        if (typeguard.type === "nil") discriminantTy = this.builtinTypes.nilType;
        else if (typeguard.type === "string") discriminantTy = this.builtinTypes.stringType;
        else if (typeguard.type === "number") discriminantTy = this.builtinTypes.numberType;
        else if (typeguard.type === "integer") discriminantTy = this.builtinTypes.integerType;
        else if (typeguard.type === "boolean") discriminantTy = this.builtinTypes.booleanType;
        else if (typeguard.type === "thread") discriminantTy = this.builtinTypes.threadType;
        else if (typeguard.type === "buffer") discriminantTy = this.builtinTypes.bufferType;
        else if (typeguard.type === "table") discriminantTy = this.builtinTypes.tableType;
        else if (typeguard.type === "function") discriminantTy = this.builtinTypes.functionType;
        else if (typeguard.type === "userdata") {
          // A typeguard through `typeof` is not accurate about userdata.
          discriminantTy = this.builtinTypes.externType;
        } else if (typeguard.type === "vector" && !typeguard.isTypeof) {
          // `vector` is defined in the embedded builtin definitions, not as a builtin type.
          const typeFun = this.globalScope.lookupType("vector");
          if (typeFun) discriminantTy = follow(typeFun.type);
        } else if (!typeguard.isTypeof) discriminantTy = this.builtinTypes.neverType;
        else {
          const typeFun = this.globalScope.lookupType(typeguard.type);
          if (typeFun && typeFun.typeParams.length === 0 && typeFun.typePackParams.length === 0) {
            const ty = follow(typeFun.type);

            // Only the root type of an extern type matters.
            const etv = get(ty, "ExternType");
            if (etv && (etv.parent === this.builtinTypes.externType || hasTag(ty, kTypeofRootTag))) discriminantTy = ty;
          }
        }

        const proposition = this.refinementArena.proposition(key, discriminantTy);
        if (op === BinaryOp.CompareEq) return [leftType, rightType, proposition];
        else if (op === BinaryOp.CompareNe) return [leftType, rightType, this.refinementArena.negation(proposition)];
        else throw new InternalCompilerError("matchTypeGuard should only return a Some under `==` or `~=`!");
      } else if (op === BinaryOp.CompareEq || op === BinaryOp.CompareNe) {
        // That `a op b` is a boolean does not mean `a` and `b` are expected to be booleans.
        const leftType = this.check(scope, left, undefined, true).ty;
        const rightType = this.check(scope, right, undefined, true).ty;

        let leftRefinement = this.refinementArena.proposition(this.dfg.getRefinementKey(left), rightType);
        let rightRefinement = this.refinementArena.proposition(this.dfg.getRefinementKey(right), leftType);

        if (op === BinaryOp.CompareNe) {
          leftRefinement = this.refinementArena.negation(leftRefinement);
          rightRefinement = this.refinementArena.negation(rightRefinement);
        }

        return [leftType, rightType, this.refinementArena.equivalence(leftRefinement, rightRefinement)];
      } else {
        const leftType = this.check(scope, left).ty;
        const rightType = this.check(scope, right).ty;
        return [leftType, rightType, undefined];
      }
    } finally {
      this.typeContext = oldTypeContext;
    }
  }

  private visitLValue(scope: Scope, expr: AstExpr, rhsType: TypeId): void {
    if (expr instanceof AstExprLocal) this.visitLValueLocal(scope, expr, rhsType);
    else if (expr instanceof AstExprGlobal) this.visitLValueGlobal(scope, expr, rhsType);
    else if (expr instanceof AstExprIndexName) this.visitLValueIndexName(scope, expr, rhsType);
    else if (expr instanceof AstExprIndexExpr) this.visitLValueIndexExpr(scope, expr, rhsType);
    else if (expr instanceof AstExprError) {
      // The subexpressions of an error expression in an lvalue position are
      // still checked, so that later visits make no invalid assumptions.
      for (const subExpr of expr.expressions) {
        this.check(scope, subExpr);
      }
    } else throw new InternalCompilerError("Unexpected lvalue expression");
  }

  private visitLValueLocal(scope: Scope, local: AstExprLocal, rhsType: TypeId): void {
    const annotatedTy = scope.lookup(local.local);

    const defId = this.dfg.getDef(local);
    let ty = scope.lookupUnrefinedType(defId);

    if (ty) {
      const localDomain = this.localTypes.get(ty);
      if (localDomain && !local.upvalue) localDomain.insert(rhsType);
    } else {
      ty = this.arena.addType(blockedType());
      let localDomain = this.localTypes.get(ty);
      if (!localDomain) this.localTypes.set(ty, (localDomain = new TypeIds()));
      localDomain.insert(rhsType);

      if (annotatedTy) {
        switch (shouldSuppressErrors(this.normalizer, annotatedTy)) {
          case ErrorSuppression.DoNotSuppress:
            break;
          case ErrorSuppression.Suppress:
            ty = this.simplifyUnion(scope, local.location, ty, this.builtinTypes.errorType);
            break;
          case ErrorSuppression.NormalizationFailed:
            this.reportError(local.local.annotation!.location, { kind: "NormalizationTooComplex" });
            break;
        }
      }

      scope.lvalueTypes.set(defId, ty);
    }

    this.recordInferredBinding(local.local, ty);

    if (annotatedTy) this.addConstraint(scope, local.location, { kind: "SubtypeConstraint", subType: rhsType, superType: annotatedTy });
  }

  private visitLValueGlobal(scope: Scope, global: AstExprGlobal, rhsType: TypeId): void {
    const annotatedTy = scope.lookup(global.name);
    if (annotatedTy) {
      const def = this.dfg.getDef(global);
      this.rootScope!.lvalueTypes.set(def, rhsType);

      // A self-assignment makes no new constraint.
      if (annotatedTy === follow(rhsType)) return;

      const followedAnnotation = follow(annotatedTy);
      const bt = get(followedAnnotation, "BlockedType");
      if (bt && this.uninitializedGlobals.has(global.name)) {
        this.uninitializedGlobals.delete(global.name);
        emplaceType(followedAnnotation, boundType(rhsType));
      }

      this.addConstraint(scope, global.location, { kind: "SubtypeConstraint", subType: rhsType, superType: annotatedTy });
    }
  }

  private visitLValueIndexName(scope: Scope, expr: AstExprIndexName, rhsType: TypeId): void {
    const lhsTy = this.check(scope, expr.expr).ty;
    const propTy = this.arena.addType(blockedType());
    this.module.astTypes.set(expr, propTy);

    const incremented = this.recordPropertyAssignment(lhsTy);

    const apc = this.addConstraint(scope, expr.location, {
      kind: "AssignPropConstraint",
      lhsType: lhsTy,
      propName: expr.index,
      rhsType,
      propLocation: expr.indexLocation,
      propType: propTy,
      decrementPropCount: incremented,
    });
    setOwner(get(propTy, "BlockedType")!, apc);
  }

  private visitLValueIndexExpr(scope: Scope, expr: AstExprIndexExpr, rhsType: TypeId): void {
    if (expr.index instanceof AstExprConstantString) {
      const constantString = expr.index;
      const lhsTy = this.check(scope, expr.expr).ty;
      const propTy = this.arena.addType(blockedType());
      this.module.astTypes.set(expr, propTy);
      this.module.astTypes.set(expr.index, this.builtinTypes.stringType);
      const propName = constantString.value;

      const incremented = this.recordPropertyAssignment(lhsTy);

      const apc = this.addConstraint(scope, expr.location, {
        kind: "AssignPropConstraint",
        lhsType: lhsTy,
        propName,
        rhsType,
        propLocation: expr.index.location,
        propType: propTy,
        decrementPropCount: incremented,
      });
      setOwner(get(propTy, "BlockedType")!, apc);

      return;
    }

    const lhsTy = this.check(scope, expr.expr).ty;
    const indexTy = this.check(scope, expr.index).ty;
    const propTy = this.arena.addType(blockedType());
    this.module.astTypes.set(expr, propTy);
    const aic = this.addConstraint(scope, expr.location, { kind: "AssignIndexConstraint", lhsType: lhsTy, indexType: indexTy, rhsType, propType: propTy });
    setOwner(get(propTy, "BlockedType")!, aic);
  }

  private checkTable(scope: Scope, expr: AstExprTable, expectedType: TypeId | undefined, generalize: boolean): Inference {
    return this.withTypeContext(TypeContext.Default, () => {
      const ty = this.arena.addType(tableType());
      const ttv = get(ty, "TableType")!;

      ttv.state = TableState.Unsealed;
      ttv.definitionModuleName = this.module.name;
      ttv.definitionLocation = expr.location;
      ttv.scope = scope;

      if (PRIMITIVE_INFERENCE_IN_TABLE_LIMIT > 0 && expr.items.length > PRIMITIVE_INFERENCE_IN_TABLE_LIMIT) this.largeTableDepth++;

      this.interiorFreeTypes[this.interiorFreeTypes.length - 1]!.types.push(ty);

      const indexKeyLowerBound = new TypeIds();
      const indexValueLowerBound = new TypeIds();

      const createIndexer = (_location: Location, currentIndexType: TypeId, currentResultType: TypeId): void => {
        indexKeyLowerBound.insert(follow(currentIndexType));
        indexValueLowerBound.insert(follow(currentResultType));
      };

      const start = checkpoint(this);

      for (const item of expr.items) {
        // Expected types reach table literals separately, through the
        // PushTypeConstraint below. With `generalize` false, types can be
        // pushed into the lambdas of a literal, as in
        //
        //  type Callback = (string) -> ()
        //
        //  local t: { Callback } = {
        //      function (s)
        //          -- s has type `string` here
        //      end
        //  }
        const itemTy = this.check(scope, item.value, /* expectedType */ undefined, /* forceSingleton */ false, generalize).ty;

        if (item.key) {
          // The key is checked even when it is a string constant, whose type
          // is not needed, to populate `astTypes`.
          const keyTy = this.check(scope, item.key).ty;

          if (item.key instanceof AstExprConstantString) {
            const propName = item.key.value;
            const prop = Property.rw(itemTy);
            prop.location = item.key.location;
            ttv.props.set(propName, prop);
          } else {
            createIndexer(item.key.location, keyTy, itemTy);
          }
        } else {
          const numberType = this.builtinTypes.numberType;
          // The location is not quite right here.
          createIndexer(item.value.location, numberType, itemTy);
        }
      }

      const end = checkpoint(this);

      if (!indexKeyLowerBound.empty()) {
        let indexKey: TypeId;
        let indexValue: TypeId;

        if (indexKeyLowerBound.size === 1) {
          indexKey = indexKeyLowerBound.front();
        } else {
          indexKey = this.arena.addType(unionType(indexKeyLowerBound.toArray()));
          this.unionsToSimplify.push(indexKey);
        }

        if (indexValueLowerBound.size === 1) {
          indexValue = indexValueLowerBound.front();
        } else {
          indexValue = this.arena.addType(unionType(indexValueLowerBound.toArray()));
          this.unionsToSimplify.push(indexValue);
        }

        ttv.indexer = new TableIndexer(indexKey, indexValue);
      }

      if (expectedType) {
        const ptc = this.addConstraint(scope, expr.location, {
          kind: "PushTypeConstraint",
          expectedType,
          targetType: ty,
          astTypes: this.module.astTypes,
          astExpectedTypes: this.module.astExpectedTypes,
          expr,
        });

        addAllAsReverseDependencies(start, end, this, ptc);
      }

      if (PRIMITIVE_INFERENCE_IN_TABLE_LIMIT > 0 && expr.items.length > PRIMITIVE_INFERENCE_IN_TABLE_LIMIT) this.largeTableDepth--;

      return inference(ty);
    });
  }

  private checkFunctionSignature(parent: Scope, fn: AstExprFunction, expectedType?: TypeId, originalName?: Location): FunctionSignature {
    let genericTypes: TypeId[] = [];
    let genericTypePacks: TypePackId[] = [];

    if (expectedType) expectedType = follow(expectedType);

    const hasGenerics = fn.generics.length > 0 || fn.genericPacks.length > 0;

    const signatureScope = this.childScope(fn, parent);

    // The return type is assigned before the body scope is created, so that
    // the body scope takes it.
    let returnType = this.freshTypePack(signatureScope, Polarity.Positive);
    signatureScope.returnType = returnType;

    const bodyScope = this.childScope(fn.body, signatureScope);

    if (hasGenerics) {
      const genericDefinitions = this.createGenerics(signatureScope, fn.generics);
      const genericPackDefinitions = this.createGenericPacks(signatureScope, fn.genericPacks);

      // Function generics have no default values, so only their types matter.
      for (const [, g] of genericDefinitions) {
        genericTypes.push(g.ty);
      }

      for (const [, g] of genericPackDefinitions) {
        genericTypePacks.push(g.tp);
      }

      expectedType = undefined;
    }

    const argTypes: TypeId[] = [];
    const argNames: (FunctionArgument | undefined)[] = [];
    let expectedArgPack: TypePack = typePack([]);

    let expectedFunction = expectedType ? get(expectedType, "FunctionType") : undefined;
    // The expected type must be precisely optional, and not `any`, which is optional too.
    if (expectedType && isOptional(expectedType) && !get(expectedType, "AnyType")) {
      const ut = get(expectedType, "UnionType");
      if (ut) {
        for (const u of flatOptions(ut)) {
          if (get(u, "FunctionType") && !isNil(u)) {
            expectedFunction = get(u, "FunctionType");
            break;
          }
        }
      }
    }

    if (expectedFunction) {
      expectedArgPack = extendTypePack(this.arena, this.builtinTypes, expectedFunction.argTypes, fn.args.length);

      genericTypes = [...expectedFunction.generics];
      genericTypePacks = [...expectedFunction.genericPacks];
    }

    if (fn.self) {
      const selfType = this.freshType(signatureScope, Polarity.Negative);
      argTypes.push(selfType);
      argNames.push({ name: fn.self.name, location: fn.self.location });
      signatureScope.bindings.set(fn.self, { typeId: selfType, location: fn.self.location });

      const def = this.dfg.getLocalDef(fn.self);
      signatureScope.lvalueTypes.set(def, selfType);
      this.updateRValueRefinements(signatureScope, def, selfType);
    }

    for (let i = 0; i < fn.args.length; ++i) {
      const local = fn.args[i]!;

      let argTy: TypeId;
      if (local.annotation) {
        argTy = this.resolveType(signatureScope, local.annotation, /* inTypeArguments */ false, /* replaceErrorWithFresh */ true, Polarity.Negative);
      } else {
        if (i < expectedArgPack.head.length) argTy = expectedArgPack.head[i]!;
        else argTy = this.freshType(signatureScope, Polarity.Negative);
      }

      argTypes.push(argTy);
      argNames.push({ name: local.name, location: local.location });

      signatureScope.bindings.set(local, { typeId: argTy, location: local.location });

      const def = this.dfg.getLocalDef(local);
      signatureScope.lvalueTypes.set(def, argTy);
      this.updateRValueRefinements(signatureScope, def, argTy);
    }

    let varargPack: TypePackId;

    if (fn.vararg) {
      if (fn.varargAnnotation) {
        const annotationType = this.resolveTypePack(signatureScope, fn.varargAnnotation, /* inTypeArguments */ false, /* replaceErrorWithFresh */ true);
        varargPack = annotationType;
      } else if (expectedArgPack.tail && getPack(expectedArgPack.tail, "VariadicTypePack")) varargPack = expectedArgPack.tail;
      else varargPack = this.builtinTypes.anyTypePack;

      signatureScope.varargPack = varargPack;
      bodyScope.varargPack = varargPack;
    } else {
      varargPack = this.arena.addTypePack(variadicTypePack(this.builtinTypes.anyType, /* hidden */ true));
      // `...` is not valid in a function without an explicit ellipsis, so
      // the signature scope has no vararg pack.

      signatureScope.varargPack = undefined;
      bodyScope.varargPack = undefined;
    }

    // Some of the unannotated parameters become generics and some do not;
    // the ones that do not are pruned when the GeneralizationConstraint
    // dispatches.

    // The self parameter never has an annotation, so it could always become generic.
    if (fn.self) genericTypes.push(argTypes[0]!);

    let typeIndex = fn.self ? 1 : 0;
    for (const astArg of fn.args) {
      const argTy = argTypes[typeIndex]!;
      if (!astArg.annotation) genericTypes.push(argTy);

      ++typeIndex;
    }

    varargPack = followPack(varargPack);
    returnType = followPack(returnType);
    if (!fn.varargAnnotation) genericTypePacks.push(varargPack);
    if (!fn.returnAnnotation) genericTypePacks.push(returnType);

    // With both an annotation and an expected type, the annotation wins;
    // checking sorts out any mismatch later.
    if (fn.returnAnnotation) {
      const annotatedRetType = this.resolveTypePack(signatureScope, fn.returnAnnotation, /* inTypeArguments */ false, /* replaceErrorWithFresh */ true);
      // The annotated type is bound directly, so that the constraints of
      // return statements know the annotated return type.
      emplaceTypePack(returnType, boundTypePack(annotatedRetType));
    } else if (expectedFunction) {
      emplaceTypePack(returnType, boundTypePack(expectedFunction.retTypes));
    }

    const actualFunction = functionType(this.arena.addTypePack(argTypes, varargPack), returnType);
    actualFunction.generics = genericTypes;
    actualFunction.genericPacks = genericTypePacks;
    actualFunction.argNames = argNames;
    actualFunction.hasSelf = fn.self !== undefined;

    const defn: FunctionDefinition = {
      definitionModuleName: this.module.name,
      definitionLocation: fn.location,
      varargLocation: fn.vararg ? fn.varargLocation : undefined,
      originalNameLocation: originalName ?? new Location(fn.location.begin, new Position(fn.location.begin.line, fn.location.begin.column + 0)),
    };
    actualFunction.definition = defn;

    const actualFunctionType = this.arena.addType(actualFunction);
    this.module.astTypes.set(fn, actualFunctionType);

    if (expectedType && get(expectedType, "FreeType")) bindFreeType(expectedType, actualFunctionType);

    this.cgraph.scopeToFunction.set(signatureScope, actualFunctionType);

    return {
      signature: actualFunctionType,
      signatureScope,
      bodyScope,
    };
  }

  /**
   * Checks the body of a function expression.
   * @param scope the scope of the function's body.
   * @param fn the function expression to check.
   */
  private checkFunctionBody(scope: Scope, fn: AstExprFunction): void {
    // When execution can reach the end of the function, the return type must accept `()`.
    const cf = this.visitBlockWithoutChildScope(scope, fn.body);
    if (cf === ControlFlow.None) {
      this.addConstraint(scope, fn.location, {
        kind: "PackSubtypeConstraint",
        subPack: this.builtinTypes.emptyTypePack,
        superPack: scope.returnType,
        returns: false,
      });
    }
  }

  private resolveReferenceType(scope: Scope, ty: AstType, ref: AstTypeReference, inTypeArguments: boolean, replaceErrorWithFresh: boolean): TypeId {
    let result: TypeId;

    let alias: TypeFun | undefined;

    if (ref.prefix !== undefined) {
      alias = scope.lookupImportedType(ref.prefix, ref.name);
    } else {
      alias = scope.lookupType(ref.name);
    }

    if (alias !== undefined) {
      // A non-generic alias needs no blocked type or instantiation constraint.
      if (alias.typeParams.length === 0 && alias.typePackParams.length === 0 && !ref.hasParameterList) {
        result = alias.type;
      } else {
        const parameters: TypeId[] = [];
        const packParameters: TypePackId[] = [];

        for (const p of ref.parameters) {
          // The parser enforces the order of types and type packs.
          if (p.type) {
            parameters.push(this.resolveType_(scope, p.type, /* inTypeArguments */ true));
          } else if (p.typePack) {
            const tp = this.resolveTypePack_(scope, p.typePack, /* inTypeArguments */ true);

            // Single-type packs fill in missing regular type parameters.
            if (parameters.length < alias.typeParams.length && packSize(tp) === 1 && finite(tp) && first(tp)) parameters.push(first(tp)!);
            else packParameters.push(tp);
          }
        }

        result = this.arena.addType(pendingExpansionType(ref.prefix, ref.name, parameters, packParameters));

        // Outside type arguments, a constraint expands the pending type; its
        // dispatch queues more constraints for nested type function applications.
        if (!inTypeArguments) this.addConstraint(scope, ty.location, { kind: "TypeAliasExpansionConstraint", target: result });
      }
    } else {
      // The type checker reports the lookup failure when it visits the type.
      this.module.astTypeReferenceLookupFailures.add(ty);
      result = this.builtinTypes.errorType;
      if (replaceErrorWithFresh) result = this.freshType(scope, Polarity.Mixed);
    }

    if (is(follow(result), "TypeFunctionInstanceType")) {
      this.reportError(ty.location, { kind: "UnappliedTypeFunction" });
      this.addConstraint(scope, ty.location, { kind: "ReduceConstraint", ty: result });
    }

    const resultGeneric = get(follow(result), "GenericType");
    if (resultGeneric) resultGeneric.polarity = (resultGeneric.polarity & Polarity.Mixed) | this.polarity;

    return result;
  }

  private resolveTableType(scope: Scope, _ty: AstType, tab: AstTypeTable, inTypeArguments: boolean, _replaceErrorWithFresh: boolean): TypeId {
    const props = new Props();
    let indexer: TableIndexer | undefined;

    const p = this.polarity;
    for (const prop of tab.props) {
      let propRef = props.get(prop.name);
      if (!propRef) props.set(prop.name, (propRef = new Property()));

      // The polarity of the property's type.
      this.polarity = polarityOfAccess(prop.access, p);

      const propTy = this.resolveType_(scope, prop.type, inTypeArguments);

      propRef.typeLocation = prop.location;

      switch (prop.access) {
        case AstTableAccess.ReadWrite:
          propRef.readTy = propTy;
          propRef.writeTy = propTy;
          break;
        case AstTableAccess.Read:
          propRef.readTy = propTy;
          break;
        case AstTableAccess.Write:
          propRef.writeTy = propTy;
          break;
        default:
          throw new InternalCompilerError(`Unexpected property access ${prop.access as number}`);
      }
    }

    const astIndexer = tab.indexer;
    if (astIndexer) {
      if (astIndexer.access === AstTableAccess.Read) {
        this.polarity = p;
        indexer = new TableIndexer(
          this.resolveType_(scope, astIndexer.indexType, inTypeArguments),
          this.resolveType_(scope, astIndexer.resultType, inTypeArguments),
          /* isReadOnly */ true,
        );
      } else if (astIndexer.access === AstTableAccess.Write) {
        this.reportError(astIndexer.accessLocation ?? new Location(), { kind: "GenericError", message: "write keyword is illegal here" });
      } else if (astIndexer.access === AstTableAccess.ReadWrite) {
        this.polarity = Polarity.Mixed;
        indexer = new TableIndexer(
          this.resolveType_(scope, astIndexer.indexType, inTypeArguments),
          this.resolveType_(scope, astIndexer.resultType, inTypeArguments),
        );
      } else throw new InternalCompilerError(`Unexpected property access ${astIndexer.access as number}`);
    }

    this.polarity = p;

    const tableTy = this.arena.addType(tableType({ props, indexer, level: copyLevel(scope.level), scope, state: TableState.Sealed }));
    const ttv = get(tableTy, "TableType")!;

    ttv.definitionModuleName = this.module.name;
    ttv.definitionLocation = tab.location;

    return tableTy;
  }

  private resolveFunctionType(scope: Scope, _ty: AstType, fn: AstTypeFunction, inTypeArguments: boolean, replaceErrorWithFresh: boolean): TypeId {
    const hasGenerics = fn.generics.length > 0 || fn.genericPacks.length > 0;
    let signatureScope: Scope;

    const genericTypes: TypeId[] = [];
    const genericTypePacks: TypePackId[] = [];

    // Without generics, no child scope is needed for their bindings.
    if (hasGenerics) {
      signatureScope = this.childScope(fn, scope);

      const genericDefinitions = this.createGenerics(signatureScope, fn.generics);
      const genericPackDefinitions = this.createGenericPacks(signatureScope, fn.genericPacks);

      for (const [, g] of genericDefinitions) {
        genericTypes.push(g.ty);
      }

      for (const [, g] of genericPackDefinitions) {
        genericTypePacks.push(g.tp);
      }
    } else {
      // The signature scope is the parent scope when there are no generics.
      signatureScope = scope;
    }

    const tempArgTypes = new AstTypePackExplicit(new Location(), fn.argTypes);

    const p = this.polarity;
    this.polarity = invertPolarity(this.polarity);
    const argTypes = this.resolveTypePack_(signatureScope, tempArgTypes, inTypeArguments, replaceErrorWithFresh);
    this.polarity = p;
    const returnTypes = this.resolveTypePack_(signatureScope, fn.returnTypes, inTypeArguments, replaceErrorWithFresh);

    const ftv = functionType(argTypes, returnTypes);
    ftv.isCheckedFunction = fn.isCheckedFunction();
    const deprecatedAttr = getAttribute(fn.attributes, AstAttrType.Deprecated);
    ftv.isDeprecatedFunction = deprecatedAttr !== undefined;

    ftv.generics = genericTypes;
    ftv.genericPacks = genericTypePacks;

    for (const el of fn.argNames) {
      if (el) {
        ftv.argNames.push({ name: el.name, location: el.location });
      } else ftv.argNames.push(undefined);
    }

    return this.arena.addType(ftv);
  }

  /**
   * Resolves a type from its annotation.
   * @param scope the scope the annotation is in.
   * @param ty the annotation to resolve.
   * @param inTypeArguments whether the type is inside type arguments, `<...>`.
   * @returns the type of the annotation.
   */
  resolveType(scope: Scope, ty: AstType, inTypeArguments: boolean, replaceErrorWithFresh = false, initialPolarity = Polarity.Positive): TypeId {
    this.polarity = initialPolarity;
    return this.resolveType_(scope, ty, inTypeArguments, replaceErrorWithFresh);
  }

  /** The recursive part of `resolveType`, which sets the polarity once at the start. */
  private resolveType_(scope: Scope, ty: AstType, inTypeArguments: boolean, replaceErrorWithFresh = false): TypeId {
    let result: TypeId;

    if (ty instanceof AstTypeReference) {
      result = this.resolveReferenceType(scope, ty, ty, inTypeArguments, replaceErrorWithFresh);
    } else if (ty instanceof AstTypeTable) {
      result = this.resolveTableType(scope, ty, ty, inTypeArguments, replaceErrorWithFresh);
    } else if (ty instanceof AstTypeFunction) {
      result = this.resolveFunctionType(scope, ty, ty, inTypeArguments, replaceErrorWithFresh);
    } else if (ty instanceof AstTypeTypeof) {
      const exprType = this.check(scope, ty.expr).ty;
      result = exprType;
    } else if (ty instanceof AstTypeOptional) {
      result = this.builtinTypes.nilType;
    } else if (ty instanceof AstTypeUnion) {
      if (ty.types.length === 1) result = this.resolveType_(scope, ty.types[0]!, inTypeArguments);
      else {
        const parts: TypeId[] = [];
        for (const part of ty.types) {
          parts.push(this.resolveType_(scope, part, inTypeArguments));
        }

        result = this.arena.addType(unionType(parts));
      }
    } else if (ty instanceof AstTypeIntersection) {
      if (ty.types.length === 1) result = this.resolveType_(scope, ty.types[0]!, inTypeArguments);
      else {
        const parts: TypeId[] = [];
        for (const part of ty.types) {
          parts.push(this.resolveType_(scope, part, inTypeArguments));
        }

        result = this.arena.addType(intersectionType(parts));
      }
    } else if (ty instanceof AstTypeGroup) {
      result = this.resolveType_(scope, ty.type, inTypeArguments);
    } else if (ty instanceof AstTypeSingletonBool) {
      if (ty.value) result = this.builtinTypes.trueType;
      else result = this.builtinTypes.falseType;
    } else if (ty instanceof AstTypeSingletonString) {
      result = this.arena.addType(stringSingleton(ty.value));
    } else if (ty instanceof AstTypeError) {
      result = this.builtinTypes.errorType;
      if (replaceErrorWithFresh) result = this.freshType(scope, this.polarity);
    } else {
      result = this.builtinTypes.errorType;
    }

    this.module.astResolvedTypes.set(ty, result);
    return result;
  }

  /**
   * Resolves a type pack from its annotation.
   * @param scope the scope the annotation is in.
   * @param tp the annotation to resolve.
   * @param inTypeArgument whether the pack is inside type arguments, `<...>`.
   * @returns the type pack of the annotation.
   */
  private resolveTypePack(
    scope: Scope,
    tp: AstTypePack,
    inTypeArgument: boolean,
    replaceErrorWithFresh = false,
    initialPolarity = Polarity.Positive,
  ): TypePackId {
    this.polarity = initialPolarity;
    return this.resolveTypePack_(scope, tp, inTypeArgument, replaceErrorWithFresh);
  }

  private resolveTypePack_(scope: Scope, tp: AstTypePack, inTypeArgument: boolean, replaceErrorWithFresh = false): TypePackId {
    let result: TypePackId;
    if (tp instanceof AstTypePackExplicit) {
      result = this.resolveTypePackList_(scope, tp.typeList, inTypeArgument, replaceErrorWithFresh);
    } else if (tp instanceof AstTypePackVariadic) {
      const ty = this.resolveType_(scope, tp.variadicType, inTypeArgument, replaceErrorWithFresh);
      result = this.arena.addTypePack(variadicTypePack(ty));
    } else if (tp instanceof AstTypePackGeneric) {
      const lookup = scope.lookupPack(tp.genericName);
      if (lookup) {
        result = lookup;
      } else {
        // The type checker reports the lookup failure when it visits the type pack.
        this.module.astTypePackReferenceLookupFailures.add(tp);
        result = this.builtinTypes.errorTypePack;
      }
    } else {
      result = this.builtinTypes.errorTypePack;
    }

    const gtp = getPack(followPack(result), "GenericTypePack");
    if (gtp) {
      // The initial polarity is unknown, so that bit is cleared by keeping at
      // most Mixed, and the current polarity is added.
      gtp.polarity = (gtp.polarity & Polarity.Mixed) | this.polarity;
    }

    this.module.astResolvedTypePacks.set(tp, result);
    return result;
  }

  private resolveTypePackList_(scope: Scope, list: AstTypeList, inTypeArguments: boolean, replaceErrorWithFresh: boolean): TypePackId {
    const head: TypeId[] = [];

    for (const headTy of list.types) {
      head.push(this.resolveType_(scope, headTy, inTypeArguments, replaceErrorWithFresh));
    }

    let tail: TypePackId | undefined = undefined;
    if (list.tailType) {
      tail = this.resolveTypePack_(scope, list.tailType, inTypeArguments, replaceErrorWithFresh);
    }

    return this.addTypePack(head, tail);
  }

  /**
   * Resolves a type pack from a list of annotations.
   * @param scope the scope the annotations are in.
   * @param list the annotations to resolve.
   * @param inTypeArguments whether the list is inside type arguments, `<...>`.
   * @returns the type pack of the annotations.
   */
  private resolveTypePackList(
    scope: Scope,
    list: AstTypeList,
    inTypeArguments: boolean,
    replaceErrorWithFresh = false,
    initialPolarity = Polarity.Positive,
  ): TypePackId {
    this.polarity = initialPolarity;
    return this.resolveTypePackList_(scope, list, inTypeArguments, replaceErrorWithFresh);
  }

  /**
   * Creates the generic types of a list of generic parameters, with a
   * blocked type standing for each default the parameters have.
   * @param scope the scope the generics belong to.
   * @param generics the generic parameters to create types for.
   * @param useCache whether to reuse the generic types of the scope's parent with the same names.
   * @param addTypes whether to add the types to the scope's private type bindings.
   */
  private createGenerics(scope: Scope, generics: AstGenericType[], useCache = false, addTypes = true): [string, GenericTypeDefinition][] {
    const result: [string, GenericTypeDefinition][] = [];
    for (const generic of generics) {
      let genericTy: TypeId;

      const it = scope.parent!.typeAliasTypeParameters.get(generic.name);
      if (useCache && it !== undefined) genericTy = it;
      else {
        genericTy = this.arena.addType(genericType({ scope, name: generic.name, polarity: Polarity.None }));
        scope.parent!.typeAliasTypeParameters.set(generic.name, genericTy);
      }

      let defaultTy: TypeId | undefined = undefined;

      if (generic.defaultValue) defaultTy = this.arena.addType(blockedType());

      if (addTypes) scope.privateTypeBindings.set(generic.name, new TypeFun(genericTy));

      result.push([generic.name, { ty: genericTy, defaultValue: defaultTy }]);
    }

    return result;
  }

  /**
   * Creates the generic type packs of a list of generic pack parameters,
   * with a blocked pack standing for each default the parameters have.
   * @param scope the scope the generic packs belong to.
   * @param generics the generic pack parameters to create packs for.
   * @param useCache whether to reuse the generic packs of the scope's parent with the same names.
   * @param addTypes whether to add the packs to the scope's private type pack bindings.
   */
  private createGenericPacks(scope: Scope, generics: AstGenericTypePack[], useCache = false, addTypes = true): [string, GenericTypePackDefinition][] {
    const result: [string, GenericTypePackDefinition][] = [];
    for (const generic of generics) {
      let genericTy: TypePackId;

      const it = scope.parent!.typeAliasTypePackParameters.get(generic.name);
      if (useCache && it !== undefined) genericTy = it;
      else {
        genericTy = this.arena.addTypePack(genericTypePack({ scope, name: generic.name, polarity: Polarity.None }));
        scope.parent!.typeAliasTypePackParameters.set(generic.name, genericTy);
      }

      let defaultTy: TypePackId | undefined = undefined;

      if (generic.defaultValue) defaultTy = this.arena.addTypePack(blockedTypePack());

      if (addTypes) scope.privateTypePackBindings.set(generic.name, genericTy);

      result.push([generic.name, { tp: genericTy, defaultValue: defaultTy }]);
    }

    return result;
  }

  private flattenPack(scope: Scope, location: Location, pack: InferencePack): Inference {
    const { tp, refinements } = pack;
    let refinement: RefinementId | undefined = undefined;
    if (refinements.length !== 0) refinement = refinements[0];

    const f = first(tp);
    if (f) return inference(f, refinement);

    const typeResult = this.arena.addType(blockedType());
    const c = this.addConstraint(scope, location, { kind: "UnpackConstraint", resultPack: [typeResult], sourcePack: tp });
    setOwner(get(typeResult, "BlockedType")!, c);

    return inference(typeResult, refinement);
  }

  private reportError(location: Location, err: TypeErrorData): void {
    this.errors.push(new LuauTypeError(location, err, this.module.name));
  }

  private reportCodeTooComplex(location: Location): void {
    this.errors.push(new LuauTypeError(location, { kind: "CodeTooComplex" }, this.module.name));

    this.recursionLimitMet = true;
  }

  /** The union of two types, simplified; a union that remains is simplified again by the solver. */
  private makeUnion(scope: Scope, location: Location, lhs: TypeId, rhs: TypeId): TypeId {
    if (get(follow(lhs), "NeverType")) return rhs;
    if (get(follow(rhs), "NeverType")) return lhs;

    const result = this.simplifyUnion(scope, location, lhs, rhs);
    if (is(follow(result), "UnionType")) this.unionsToSimplify.push(result);
    return result;
  }

  /** The union of some types, which the solver later simplifies to keep types small. */
  private makeUnionOf(options: TypeId[]): TypeId {
    const ub = new UnionBuilder(this.arena, this.builtinTypes);

    for (const option of options) ub.add(option);

    const unionTy = ub.build();

    if (is(unionTy, "UnionType")) this.unionsToSimplify.push(unionTy);

    return unionTy;
  }

  /** An `intersect` type function instance of two types. */
  private makeIntersect(scope: Scope, location: Location, lhs: TypeId, rhs: TypeId): TypeId {
    const resultType = this.createTypeFunctionInstance(this.builtinTypes.typeFunctions.intersectFunc, [lhs, rhs], [], scope, location);

    return resultType;
  }

  /**
   * Scans the program for global definitions, to tell globals apart from
   * accesses to undefined symbols.
   */
  private prepopulateGlobalScope(globalScope: Scope, program: AstStatBlock): void {
    const gp = new GlobalPrepopulator(globalScope, this.arena, this.dfg);

    if (this.prepareModuleScope) this.prepareModuleScope(this.module.name, globalScope);

    visitAst(program, gp);

    for (const name of gp.uninitializedGlobals) this.uninitializedGlobals.add(name);

    // The globals of the type function environment are handled too, without
    // preparing a module scope, since that environment is separate.
    const tfgp = new GlobalPrepopulator(this.typeFunctionRuntime.rootScope!, this.arena, this.dfg);
    visitAst(program, tfgp);

    for (const name of tfgp.uninitializedGlobals) this.uninitializedGlobals.add(name);
  }

  private recordPropertyAssignment(ty: TypeId): boolean {
    const seen = new Set<TypeId>();
    const queue: TypeId[] = [];

    queue.push(ty);

    let incremented = false;

    while (queue.length !== 0) {
      const t = follow(queue.shift()!);

      if (seen.has(t)) continue;
      seen.add(t);

      const tt = get(t, "TableType");
      if (tt && tt.state === TableState.Unsealed) {
        tt.remainingProps += 1;
        incremented = true;
        continue;
      }

      const mt = get(t, "MetatableType");
      if (mt) {
        queue.push(mt.table);
        continue;
      }

      const localDomain = this.localTypes.get(t);
      if (localDomain) {
        for (const domainTy of localDomain) queue.push(domainTy);
        continue;
      }

      const ut = get(t, "UnionType");
      if (ut) {
        for (const part of flatOptions(ut)) queue.push(part);
      }
    }

    return incremented;
  }

  /** Records that a local has a type in at least one of its states. */
  private recordInferredBinding(local: AstLocal, ty: TypeId): void {
    const ib = this.inferredBindings.get(local);
    if (ib) ib.types.insert(ty);
  }

  private fillInInferredBindings(_globalScope: Scope, _block: AstStatBlock): void {
    for (const [symbol, p] of this.inferredBindings) {
      const { scope, location, types } = p;

      const tys = types.toArray();
      if (tys.length === 1) scope.bindings.set(symbol, { typeId: tys[0]!, location });
      else {
        const ty = this.makeUnionOf(tys);
        scope.bindings.set(symbol, { typeId: ty, location });
      }
    }
  }

  /**
   * The types the calls to an overloaded function are expected to take:
   * each argument position takes the union of the overloads' parameters
   * there, so `((number) -> string) & ((string) -> number)` gives `[number | string]`.
   */
  private getExpectedCallTypesForFunctionOverloads(fnType: TypeId): (TypeId | undefined)[] {
    const funTys: TypeId[] = [];
    const it = get(follow(fnType), "IntersectionType");
    if (it) {
      for (const intersectionComponent of flatOptions(it)) {
        funTys.push(intersectionComponent);
      }
    }

    const expectedTypes: (TypeId | undefined)[] = [];
    // For the functions `f_0 : e_0 -> r_0, ..., f_n : e_n -> r_n`, the
    // arguments each position can take are the union of the arguments at it.
    const assignOption = (index: number, ty: TypeId): void => {
      if (index === expectedTypes.length) {
        expectedTypes.push(ty);
      } else if (ty) {
        const el = expectedTypes[index];

        if (!el) expectedTypes[index] = ty;
        else {
          const result = reduceUnion([el, ty]);
          if (result.length === 0) expectedTypes[index] = this.builtinTypes.neverType;
          else if (result.length === 1) expectedTypes[index] = result[0];
          else expectedTypes[index] = this.makeUnionOf(result);
        }
      }
    };

    for (const overload of funTys) {
      const ftv = get(follow(overload), "FunctionType");
      if (ftv) {
        const { head: argsHead, tail } = flatten(ftv.argTypes);
        let argsTail = tail;
        const start = ftv.hasSelf ? 1 : 0;
        let index = 0;
        for (let i = start; i < argsHead.length; ++i) assignOption(index++, argsHead[i]!);
        if (argsTail) {
          argsTail = followPack(argsTail);
          const vtp = getPack(argsTail, "VariadicTypePack");
          if (vtp) {
            while (index < funTys.length) assignOption(index++, vtp.ty);
          }
        }
      }
    }

    return expectedTypes;
  }

  private createTypeFunctionInstance(fn: TypeFunction, typeArguments: TypeId[], packArguments: TypePackId[], scope: Scope, location: Location): TypeId {
    const result = this.arena.addTypeFunction(fn, typeArguments, packArguments);
    this.addConstraint(scope, location, { kind: "ReduceConstraint", ty: result });
    return result;
  }

  private simplifyUnion(_scope: Scope, _location: Location, left: TypeId, right: TypeId): TypeId {
    return simplifyUnion(this.builtinTypes, this.arena, left, right).result;
  }

  private updateRValueRefinements(scope: Scope, def: DefId, ty: TypeId): void {
    scope.rvalueRefinements.set(def, ty);
  }
}
