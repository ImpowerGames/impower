// The strict-mode type checker, ported from Luau's `TypeChecker2.h`/
// `TypeChecker2.cpp`; Luau is MIT-licensed (see `LICENSE-luau.txt`).

import {
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
  AstTypeFunction,
  AstTypeGroup,
  AstTypeIntersection,
  AstTypePackExplicit,
  AstTypePackGeneric,
  AstTypePackVariadic,
  AstTypeReference,
  AstTypeTable,
  AstTypeTypeof,
  AstTypeUnion,
  BinaryOp,
  binaryOpToString,
  TableItemKind,
  UnaryOp,
  type AstExpr,
  type AstGenericType,
  type AstGenericTypePack,
  type AstNode,
  type AstStat,
  type AstType,
  type AstTypeList,
  type AstTypeOrPack,
  type AstTypePack,
} from "./Ast";
import { findUniqueTypesIn } from "./AstUtils";
import { matchAssert, matchSetMetatable, matchTypeOf } from "./BuiltinDefinitions";
import { ValueContext } from "./Constraint";
import { getFallthrough } from "./DataFlowGraph";
import {
  CannotExtendTableContext,
  CannotInferBinaryOperationKind,
  copyErrors,
  countMismatch,
  CountMismatchContext,
  LuauTypeError,
  MissingPropertiesContext,
  PropertyAccessViolationContext,
  typeMismatch,
  UnknownSymbolContext,
  type TypeErrorData,
} from "./Error";
import { instantiate, Instantiation } from "./Instantiation";
import { Location, Position } from "./Location";
import { kBinaryOpMetamethods, kUnaryOpMetamethods } from "./Metamethods";
import type { Module, SourceModule } from "./Module";
import { NormalizationResult, Normalizer, type NormalizedType, type UnifierSharedState } from "./Normalize";
import { OverloadResolver } from "./OverloadResolver";
import type { Scope } from "./Scope";
import { simplifyIntersection } from "./Simplify";
import { sparkdownValue } from "./SparkdownReading";
import { Subtyping, SubtypingVariance, type SubtypingResult } from "./Subtyping";
import { toString, toStringPack, toStringTypeOrPack } from "./ToString";
import {
  compareNames,
  emplaceTypePack,
  finite,
  first,
  flatOptions,
  flatten,
  follow,
  followPack,
  freeTypePack,
  functionType,
  get,
  getMetatable,
  getPack,
  getTableType,
  hasLength,
  intersectionType,
  is,
  isBoolean,
  isNil,
  isOptional,
  isString,
  isVariadic,
  lookupExternTypeProp,
  packSize,
  PrimitiveKind,
  stringSingleton,
  TypeLevel,
  typePack,
  unionType,
  type BuiltinTypes,
  type FunctionType,
  type MetatableType,
  type Props,
  type TypeArena,
  type TypeFunctionInstanceType,
  type TypeFunctionInstanceTypePack,
  type TypeId,
  type TypePack,
  type TypePackId,
  type TypePackVariant,
  type TypeVariant,
  type UnionType,
} from "./Type";
import { reduceTypeFunctions, TypeFunctionContext, type TypeCheckLimits, type TypeFunctionRuntime } from "./TypeFunction";
import { TypeFunctionReductionGuesser } from "./TypeFunctionReductionGuesser";
import { TypeIds } from "./TypeIds";
import { IndexVariant, isTypeId, renderTypePath, traverse, TypeField, type Path, type TypeOrPack, type TypePathRenderMetadata } from "./TypePath";
import {
  ErrorSuppression,
  extendTypePack,
  extractMatchingTableType,
  findMetatableEntry,
  findTablePropertyRespectingMeta,
  getParameterExtents,
  inConditional,
  isRecord,
  orElse,
  shouldSuppressErrors,
  shouldSuppressErrorsPack,
  stripNil,
  TypeContext,
} from "./TypeUtils";
import { TypeOnceVisitor } from "./VisitType";

export class Reasonings {
  constructor(
    public reasons: string[] = [],
    public suppressed = false,
  ) {}

  toString(): string {
    if (this.reasons.length === 0) return "";

    this.reasons.sort(compareNames);
    let allReasons = this.reasons.length < 2 ? "\n" : "\nthis is because ";
    for (const reason of this.reasons) {
      if (this.reasons.length > 1) allReasons += "\n\t * ";

      allReasons += reason;
    }

    return allReasons;
  }
}

class PropertyTypes {
  constructor(
    readonly typesOfProp: TypeId[],
    readonly missingProp: TypeId[],
  ) {}

  foundOneProp(): boolean {
    return this.typesOfProp.length > 0;
  }

  noneMissingProp(): boolean {
    return this.missingProp.length === 0;
  }

  foundMissingProp(): boolean {
    return this.missingProp.length > 0;
  }
}

interface PropertyType {
  present: NormalizationResult;
  result: TypeId | undefined;
}

type UnknownPropertyData = Extract<TypeErrorData, { kind: "UnknownProperty" }>;

function getIdentifierOfBaseVar(node: AstExpr): string | undefined {
  if (node instanceof AstExprGlobal) return node.name;

  if (node instanceof AstExprLocal) return node.local.name;

  if (node instanceof AstExprIndexExpr) return getIdentifierOfBaseVar(node.expr);

  if (node instanceof AstExprIndexName) return getIdentifierOfBaseVar(node.expr);

  return undefined;
}

function areEquivalent(
  a: TypeFunctionInstanceType | TypeFunctionInstanceTypePack,
  b: TypeFunctionInstanceType | TypeFunctionInstanceTypePack,
): boolean {
  if (a.function !== b.function) return false;

  if (a.typeArguments.length !== b.typeArguments.length || a.packArguments.length !== b.packArguments.length) return false;

  for (let i = 0; i < a.typeArguments.length; ++i) {
    if (follow(a.typeArguments[i]!) !== follow(b.typeArguments[i]!)) return false;
  }

  for (let i = 0; i < a.packArguments.length; ++i) {
    if (followPack(a.packArguments[i]!) !== followPack(b.packArguments[i]!)) return false;
  }

  return true;
}

class TypeFunctionFinder extends TypeOnceVisitor {
  mentionedFunctions = new Set<TypeId>();
  mentionedFunctionPacks = new Set<TypePackId>();

  constructor() {
    super("TypeFunctionFinder", true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    if (v.kind === "TypeFunctionInstanceType") {
      this.mentionedFunctions.add(ty);
      return true;
    }
    return super.visitType(ty, v);
  }

  override visitTypePack(tp: TypePackId, v: TypePackVariant): boolean {
    if (v.kind === "TypeFunctionInstanceTypePack") {
      this.mentionedFunctionPacks.add(tp);
      return true;
    }
    return super.visitTypePack(tp, v);
  }
}

class InternalTypeFunctionFinder extends TypeOnceVisitor {
  internalFunctions = new Set<TypeId>();
  internalPackFunctions = new Set<TypePackId>();
  mentionedFunctions: Set<TypeId>;
  mentionedFunctionPacks: Set<TypePackId>;

  constructor(declStack: TypeId[]) {
    super("InternalTypeFunctionFinder", true);
    const f = new TypeFunctionFinder();
    for (const fn of declStack) f.traverse(fn);

    this.mentionedFunctions = f.mentionedFunctions;
    this.mentionedFunctionPacks = f.mentionedFunctionPacks;
  }

  override visitType(ty: TypeId, tfit: TypeVariant): boolean {
    if (tfit.kind !== "TypeFunctionInstanceType") return super.visitType(ty, tfit);

    let hasGeneric = false;

    for (const p of tfit.typeArguments) {
      if (get(follow(p), "GenericType")) {
        hasGeneric = true;
        break;
      }
    }

    for (const p of tfit.packArguments) {
      if (getPack(followPack(p), "GenericTypePack")) {
        hasGeneric = true;
        break;
      }
    }

    if (hasGeneric) {
      for (const mentioned of this.mentionedFunctions) {
        const mentionedTfit = get(mentioned, "TypeFunctionInstanceType")!;
        if (areEquivalent(tfit, mentionedTfit)) {
          return true;
        }
      }

      this.internalFunctions.add(ty);
    }

    return true;
  }

  override visitTypePack(tp: TypePackId, tfitp: TypePackVariant): boolean {
    if (tfitp.kind !== "TypeFunctionInstanceTypePack") return super.visitTypePack(tp, tfitp);

    let hasGeneric = false;

    for (const p of tfitp.typeArguments) {
      if (get(follow(p), "GenericType")) {
        hasGeneric = true;
        break;
      }
    }

    for (const p of tfitp.packArguments) {
      if (getPack(followPack(p), "GenericTypePack")) {
        hasGeneric = true;
        break;
      }
    }

    if (hasGeneric) {
      for (const mentioned of this.mentionedFunctionPacks) {
        const mentionedTfitp = getPack(mentioned, "TypeFunctionInstanceTypePack")!;
        if (areEquivalent(tfitp, mentionedTfitp)) {
          return true;
        }
      }

      this.internalPackFunctions.add(tp);
    }

    return true;
  }
}

function getLocation(array: readonly AstNode[]): Location {
  if (array.length === 0) return new Location();

  return new Location(array[0]!.location.begin, array[array.length - 1]!.location.end);
}

function asciiToLower(c: number): number {
  return c >= 0x41 && c <= 0x5a ? c + 0x20 : c;
}

function equalsLower(lhs: string, rhs: string): boolean {
  if (lhs.length !== rhs.length) return false;

  for (let i = 0; i < lhs.length; i++) {
    if (asciiToLower(lhs.charCodeAt(i)) !== asciiToLower(rhs.charCodeAt(i))) return false;
  }

  return true;
}

function atLocation(errors: LuauTypeError[], location: Location): LuauTypeError[] {
  return errors.map((e) => new LuauTypeError(location, e.data, e.moduleName));
}

function reportAvailableOverloads(errors: LuauTypeError[], location: Location, moduleName: string, overloads: TypeId[]): void {
  if (overloads.length === 0) return;

  let s = "Available overloads: ";

  if (overloads.length <= 1) return;

  for (let i = 0; i < overloads.length; ++i) {
    if (i > 0) s += i === overloads.length - 1 ? "; and " : "; ";

    s += toString(overloads[i]!);
  }

  errors.push(new LuauTypeError(location, { kind: "ExtraInformation", message: s }, moduleName));
}

function isOkToCompare(
  normalizer: Normalizer,
  typesHaveIntersection: NormalizationResult,
  normLeft: NormalizedType | undefined,
  normRight: NormalizedType | undefined,
): boolean {
  if (NormalizationResult.False !== typesHaveIntersection) return true;

  if (!normLeft || !normRight) return true;

  if (normLeft.isNil() || normRight.isNil()) return true;
  else if (
    NormalizationResult.True !== normalizer.isInhabitedNormal(normLeft) ||
    NormalizationResult.True !== normalizer.isInhabitedNormal(normRight)
  )
    return true;
  else if (!normLeft.strings.isNever() && !normRight.strings.isNever()) return true;

  return false;
}

function isComparisonOp(op: BinaryOp): boolean {
  return (
    op === BinaryOp.CompareNe ||
    op === BinaryOp.CompareEq ||
    op === BinaryOp.CompareGe ||
    op === BinaryOp.CompareGt ||
    op === BinaryOp.CompareLe ||
    op === BinaryOp.CompareLt
  );
}

function isTopLevelReturnIndex(path: Path, componentIndex: number): boolean {
  for (let i = 0; i + 1 < componentIndex; ++i) {
    const index = path.components[i]!;
    if (index.kind !== "Index" || index.variant === IndexVariant.Pack) return false;
  }

  return true;
}

export function check(
  builtinTypes: BuiltinTypes,
  typeFunctionRuntime: TypeFunctionRuntime,
  unifierState: UnifierSharedState,
  limits: TypeCheckLimits,
  sourceModule: SourceModule,
  module: Module,
): void {
  const typeChecker = new TypeChecker2(builtinTypes, typeFunctionRuntime, unifierState, limits, sourceModule, module);

  typeChecker.visit(sourceModule.root);

  copyErrors(module.errors, module.interfaceTypes, builtinTypes);
}

export class TypeChecker2 {
  readonly builtinTypes: BuiltinTypes;
  readonly typeFunctionRuntime: TypeFunctionRuntime;
  readonly limits: TypeCheckLimits;
  readonly sourceModule: SourceModule;
  readonly module: Module;

  typeContext = TypeContext.Default;
  stack: Scope[] = [];
  functionDeclStack: TypeId[] = [];

  seenTypeFunctionInstances = new Set<TypeId>();
  reportedUserTypeFunctionInstances = new Set<TypeId>();

  readonly normalizer: Normalizer;
  readonly subtyping: Subtyping;

  private readonly warnedGlobals = new Set<string>();

  constructor(
    builtinTypes: BuiltinTypes,
    typeFunctionRuntime: TypeFunctionRuntime,
    unifierState: UnifierSharedState,
    limits: TypeCheckLimits,
    sourceModule: SourceModule,
    module: Module,
  ) {
    this.builtinTypes = builtinTypes;
    this.typeFunctionRuntime = typeFunctionRuntime;
    this.limits = limits;
    this.sourceModule = sourceModule;
    this.module = module;
    this.normalizer = new Normalizer(module.internalTypes, builtinTypes, unifierState, true);
    this.subtyping = new Subtyping(builtinTypes, module.internalTypes, this.normalizer, typeFunctionRuntime);
  }

  private back(): Scope {
    return this.stack[this.stack.length - 1]!;
  }

  private inConditionalContext(f: () => void, newValue = TypeContext.Condition): void {
    const oldValue = this.typeContext;
    this.typeContext = newValue;
    try {
      f();
    } finally {
      this.typeContext = oldValue;
    }
  }

  private static allowsNoReturnValues(tp: TypePackId): boolean {
    for (const ty of flatten(tp).head) {
      if (!get(follow(ty), "ErrorType")) return false;
    }

    return true;
  }

  private static getEndLocation(fn: AstExprFunction): Location {
    let loc = fn.location;
    if (loc.begin.line !== loc.end.line) {
      const begin = new Position(loc.end.line, Math.max(0, (loc.end.column - 3) >>> 0));
      loc = new Location(begin, new Position(begin.line, (begin.column + 3) >>> 0));
    }

    return loc;
  }

  private pushStack(node: AstNode): boolean {
    const scope = this.module.astScopes.get(node);
    if (scope) {
      this.stack.push(scope);
      return true;
    } else return false;
  }

  private checkForInternalTypeFunction(ty: TypeId, location: Location): void {
    const finder = new InternalTypeFunctionFinder(this.functionDeclStack);
    finder.traverse(ty);

    for (const internal of finder.internalFunctions) this.reportError({ kind: "WhereClauseNeeded", ty: internal }, location);

    for (const internal of finder.internalPackFunctions) this.reportError({ kind: "PackWhereClauseNeeded", tp: internal }, location);
  }

  private checkForTypeFunctionInhabitance(instance: TypeId, location: Location, inAnnotation = false): TypeId {
    const tfit = inAnnotation ? get(instance, "TypeFunctionInstanceType") : undefined;
    const reportsUserError =
      tfit?.function === this.builtinTypes.typeFunctions.userFunc && !this.reportedUserTypeFunctionInstances.has(instance);

    const firstCheck = !this.seenTypeFunctionInstances.has(instance);
    if (!firstCheck && !reportsUserError) return instance;
    this.seenTypeFunctionInstances.add(instance);
    if (reportsUserError) this.reportedUserTypeFunctionInstances.add(instance);

    const context = new TypeFunctionContext({
      arena: this.module.internalTypes,
      builtins: this.builtinTypes,
      scope: this.back(),
      normalizer: this.normalizer,
      typeFunctionRuntime: this.typeFunctionRuntime,
      limits: this.limits,
      subtyping: this.subtyping,
    });

    const errors = reduceTypeFunctions(instance, location, context, true).errors.filter((e) =>
      e.data.kind === "UserDefinedTypeFunctionError" ? reportsUserError : firstCheck,
    );
    if (!this.isErrorSuppressing(location, instance)) this.reportErrors(errors);
    return instance;
  }

  private lookupPack(expr: AstExpr): TypePackId {
    const tp = this.module.astTypePacks.get(expr);
    if (tp) return followPack(tp);
    else return this.builtinTypes.anyTypePack;
  }

  private lookupType(expr: AstExpr): TypeId {
    const ty = this.module.astTypes.get(expr);
    if (ty) return this.checkForTypeFunctionInhabitance(follow(ty), expr.location);

    const tp = this.module.astTypePacks.get(expr);
    if (tp) return this.checkForTypeFunctionInhabitance(this.flattenPack(tp), expr.location);

    return this.builtinTypes.anyType;
  }

  private lookupAnnotation(annotation: AstType): TypeId {
    // TypeChecker2.cpp:560–564 at 7d5f733.
    if (this.limits.debugMagicTypes && annotation instanceof AstTypeReference && annotation.name === "_luau_force_constraint_solving_incomplete") {
      this.reportError({ kind: "ConstraintSolvingIncompleteError" }, annotation.location);
      return this.builtinTypes.anyType;
    }
    const ty = this.module.astResolvedTypes.get(annotation);

    if (this.module.constraintGenerationDidNotComplete && !ty) return this.builtinTypes.anyType;

    return this.checkForTypeFunctionInhabitance(follow(ty!), annotation.location, true);
  }

  private lookupPackAnnotation(annotation: AstTypePack): TypePackId | undefined {
    const tp = this.module.astResolvedTypePacks.get(annotation);
    if (tp !== undefined) return followPack(tp);
    return undefined;
  }

  protected lookupExpectedType(expr: AstExpr): TypeId {
    const ty = this.module.astExpectedTypes.get(expr);
    if (ty) return follow(ty);

    return this.builtinTypes.anyType;
  }

  protected lookupExpectedPack(expr: AstExpr, arena: TypeArena): TypePackId {
    const ty = this.module.astExpectedTypes.get(expr);
    if (ty) return arena.addTypePack([follow(ty)]);

    return this.builtinTypes.anyTypePack;
  }

  protected reconstructPack(exprs: AstExpr[], arena: TypeArena): TypePackId {
    if (exprs.length === 0) return arena.addTypePack([]);

    const head: TypeId[] = [];

    for (let i = 0; i < exprs.length - 1; ++i) {
      head.push(this.lookupType(exprs[i]!));
    }

    const tail = this.lookupPack(exprs[exprs.length - 1]!);
    return arena.addTypePack(head, tail);
  }

  private findInnermostScope(location: Location): Scope {
    let bestScope = this.module.getModuleScope();

    let didNarrow: boolean;
    do {
      didNarrow = false;
      for (const scope of bestScope.children) {
        if (scope.location.encloses(location)) {
          bestScope = scope;
          didNarrow = true;
          break;
        }
      }
    } while (didNarrow && bestScope.children.length > 0);

    return bestScope;
  }

  private visitStat(stat: AstStat): void {
    const pushed = this.pushStack(stat);
    try {
      if (stat instanceof AstStatBlock) return this.visit(stat);
      else if (stat instanceof AstStatIf) return this.visitStatIf(stat);
      else if (stat instanceof AstStatWhile) return this.visitStatWhile(stat);
      else if (stat instanceof AstStatRepeat) return this.visitStatRepeat(stat);
      else if (stat instanceof AstStatBreak) return;
      else if (stat instanceof AstStatContinue) return;
      else if (stat instanceof AstStatReturn) return this.visitStatReturn(stat);
      else if (stat instanceof AstStatExpr) return this.visitStatExpr(stat);
      else if (stat instanceof AstStatLocal) return this.visitStatLocal(stat);
      else if (stat instanceof AstStatFor) return this.visitStatFor(stat);
      else if (stat instanceof AstStatForIn) return this.visitStatForIn(stat);
      else if (stat instanceof AstStatAssign) return this.visitStatAssign(stat);
      else if (stat instanceof AstStatCompoundAssign) return this.visitStatCompoundAssign(stat);
      else if (stat instanceof AstStatFunction) return this.visitStatFunction(stat);
      else if (stat instanceof AstStatLocalFunction) return this.visitStatLocalFunction(stat);
      else if (stat instanceof AstStatTypeAlias) return this.visitStatTypeAlias(stat);
      else if (stat instanceof AstStatTypeFunction) return this.visitExprFunction(stat.body);
      else if (stat instanceof AstStatDeclareFunction) return this.visitStatDeclareFunction(stat);
      else if (stat instanceof AstStatDeclareGlobal) return this.visitStatDeclareGlobal(stat);
      else if (stat instanceof AstStatDeclareExternType) return this.visitStatDeclareExternType(stat);
      else if (stat instanceof AstStatError) return this.visitStatError(stat);
    } finally {
      if (pushed) this.stack.pop();
    }
  }

  visit(block: AstStatBlock): void {
    const pushed = this.pushStack(block);
    try {
      for (const statement of block.body) this.visitStat(statement);
    } finally {
      if (pushed) this.stack.pop();
    }
  }

  private visitStatIf(ifStatement: AstStatIf): void {
    this.inConditionalContext(() => this.visitExpr(ifStatement.condition, ValueContext.RValue));

    this.visit(ifStatement.thenbody);
    if (ifStatement.elsebody) this.visitStat(ifStatement.elsebody);
  }

  private visitStatWhile(whileStatement: AstStatWhile): void {
    this.visitExpr(whileStatement.condition, ValueContext.RValue);
    this.visit(whileStatement.body);
  }

  private visitStatRepeat(repeatStatement: AstStatRepeat): void {
    this.visit(repeatStatement.body);
    this.visitExpr(repeatStatement.condition, ValueContext.RValue);
  }

  private visitStatReturn(ret: AstStatReturn): void {
    const scope = this.findInnermostScope(ret.location);
    const expectedRetType = scope.returnType;
    if (ret.list.length === 0) {
      this.testIsSubtypePack(this.builtinTypes.emptyTypePack, expectedRetType, ret.location);
      return;
    }

    const { head } = extendTypePack(this.module.internalTypes, this.builtinTypes, expectedRetType, ret.list.length);
    let isSubtype = true;
    const actualHead: TypeId[] = [];
    let actualTail: TypePackId | undefined;
    for (let idx = 0; idx < ret.list.length - 1; idx++) {
      if (idx < head.length) {
        if (!this.testLiteralOrAstTypeIsSubtype(ret.list[idx]!, head[idx]!)) isSubtype = false;
        actualHead.push(head[idx]!);
      } else {
        actualHead.push(this.lookupType(ret.list[idx]!));
      }
    }

    const lastExpr = ret.list[ret.list.length - 1]!;

    if (head.length < ret.list.length || lastExpr instanceof AstExprVarargs) {
      actualTail = this.lookupPack(lastExpr);
    } else if (lastExpr instanceof AstExprCall) {
      const lastType = head[ret.list.length - 1]!;
      const setMetatableSubtype = this.testSetMetatableCallIsSubtype(lastExpr, lastType);
      if (setMetatableSubtype !== undefined) {
        if (!setMetatableSubtype) isSubtype = false;
        actualHead.push(lastType);
      } else {
        actualTail = this.lookupPack(lastExpr);
      }
    } else {
      const lastType = head[ret.list.length - 1]!;
      if (!this.testLiteralOrAstTypeIsSubtype(lastExpr, lastType)) isSubtype = false;
      actualHead.push(lastType);
    }

    if (isSubtype) {
      const reconstructedRetType = this.module.internalTypes.addTypePack(actualHead, actualTail);
      this.testIsSubtypePack(reconstructedRetType, expectedRetType, ret.location);
    }

    for (const expr of ret.list) this.visitExpr(expr, ValueContext.RValue);
  }

  private visitStatExpr(expr: AstStatExpr): void {
    this.visitExpr(expr.expr, ValueContext.RValue);
  }

  private visitStatLocal(local: AstStatLocal): void {
    const count = Math.max(local.values.length, local.vars.length);
    for (let i = 0; i < count; ++i) {
      const value = i < local.values.length ? local.values[i] : undefined;
      const isPack = value !== undefined && (value instanceof AstExprCall || value instanceof AstExprVarargs);

      if (value) this.visitExpr(value, ValueContext.RValue);

      if (i !== local.values.length - 1 || !isPack) {
        const variable = i < local.vars.length ? local.vars[i] : undefined;

        if (variable && variable.annotation) {
          const annotationType = this.lookupAnnotation(variable.annotation);
          const valueType = value ? this.lookupType(value) : undefined;
          if (valueType) this.testPotentialLiteralIsSubtype(value!, annotationType);

          this.visitType(variable.annotation);
        }
      } else if (value) {
        const valuePack = this.lookupPack(value);
        let valueTypes: TypePack = typePack([]);
        if (i < local.vars.length) valueTypes = extendTypePack(this.module.internalTypes, this.builtinTypes, valuePack, local.vars.length - i);

        let errorLocation = new Location();
        for (let j = i; j < local.vars.length; ++j) {
          if (j - i >= valueTypes.head.length) {
            errorLocation = local.vars[j]!.location;
            break;
          }

          const variable = local.vars[j]!;
          if (variable.annotation) {
            const varType = this.lookupAnnotation(variable.annotation);
            if (this.testSetMetatableCallIsSubtype(value, varType) === undefined) {
              this.testIsSubtype(valueTypes.head[j - i]!, varType, value.location);
            }

            this.visitType(variable.annotation);
          }
        }

        const remainingVars = local.vars.length >= i ? local.vars.length - i : Number.MAX_SAFE_INTEGER;
        if (valueTypes.head.length < remainingVars) {
          this.reportError(
            countMismatch(
              local.values.length - 1 + valueTypes.head.length,
              local.vars.length,
              local.values[local.values.length - 1] instanceof AstExprCall
                ? CountMismatchContext.FunctionResult
                : CountMismatchContext.ExprListResult,
            ),
            errorLocation,
          );
        }
      }
    }
  }

  private visitStatFor(forStatement: AstStatFor): void {
    if (forStatement.variable.annotation) {
      this.visitType(forStatement.variable.annotation);

      const annotatedType = this.lookupAnnotation(forStatement.variable.annotation);
      this.testIsSubtype(this.builtinTypes.numberType, annotatedType, forStatement.variable.location);
    }

    const checkNumber = (expr: AstExpr | undefined): void => {
      if (!expr) return;

      this.visitExpr(expr, ValueContext.RValue);
      this.testIsSubtype(this.lookupType(expr), this.builtinTypes.numberType, expr.location);
    };

    checkNumber(forStatement.from);
    checkNumber(forStatement.to);
    checkNumber(forStatement.step);

    this.visit(forStatement.body);
  }

  private visitStatForIn(forInStatement: AstStatForIn): void {
    for (const local of forInStatement.vars) {
      if (local.annotation) this.visitType(local.annotation);
    }

    for (const expr of forInStatement.values) this.visitExpr(expr, ValueContext.RValue);

    this.visit(forInStatement.body);

    if (!forInStatement.vars.length || !forInStatement.values.length) return;

    const scope = this.back();
    const arena = this.module.internalTypes;

    const variableTypes: TypeId[] = [];
    for (const variable of forInStatement.vars) {
      const ty = scope.lookup(variable);
      variableTypes.push(ty!);
    }

    const firstValue = forInStatement.values[0]!;

    let valueTypes: TypeId[] = [];
    let iteratorTail: TypePackId | undefined;

    const retPack = this.module.astTypePacks.get(firstValue);
    if (retPack) {
      const { head, tail } = flatten(retPack);
      valueTypes = head;
      iteratorTail = tail;
    } else {
      valueTypes.push(this.lookupType(firstValue));
    }

    const resolvedTy = this.module.astForInNextTypes.get(firstValue);
    if (resolvedTy && (!retPack || valueTypes.length > 1)) valueTypes[0] = resolvedTy;

    for (let i = 1; i < forInStatement.values.length - 1; ++i) {
      valueTypes.push(this.lookupType(forInStatement.values[i]!));
    }

    if (forInStatement.values.length > 1) {
      const { head, tail } = flatten(this.lookupPack(forInStatement.values[forInStatement.values.length - 1]!));
      valueTypes.push(...head);
      iteratorTail = tail;
    }

    const iteratorPack = arena.addTypePack(valueTypes, iteratorTail);

    const iteratorTypes = extendTypePack(arena, this.builtinTypes, iteratorPack, 3);
    if (iteratorTypes.head.length === 0) {
      this.reportError(
        { kind: "GenericError", message: "for..in loops require at least one value to iterate over.  Got zero" },
        getLocation(forInStatement.values),
      );
      return;
    }
    const iteratorTy = follow(iteratorTypes.head[0]!);

    const checkFunction = (iterFtv: FunctionType, iterTys: TypeId[], isMm: boolean): void => {
      if (iterTys.length < 1 || iterTys.length > 3) {
        if (isMm) {
          this.reportError(
            { kind: "GenericError", message: "__iter metamethod must return (next[, table[, state]])" },
            getLocation(forInStatement.values),
          );
        } else {
          this.reportError(
            { kind: "GenericError", message: "for..in loops must be passed (next[, table[, state]])" },
            getLocation(forInStatement.values),
          );
        }

        return;
      }

      const expectedVariableTypes = extendTypePack(arena, this.builtinTypes, iterFtv.retTypes, variableTypes.length);
      if (expectedVariableTypes.head.length < variableTypes.length) {
        if (isMm) {
          this.reportError(
            { kind: "GenericError", message: "__iter metamethod's next() function does not return enough values" },
            getLocation(forInStatement.values),
          );
        } else {
          this.reportError({ kind: "GenericError", message: "next() does not return enough values" }, forInStatement.values[0]!.location);
        }

        return;
      }

      if (get(follow(this.flattenPack(iterFtv.argTypes)), "ErrorType")) return;

      const { min: minCount } = getParameterExtents(iterFtv.argTypes, true);

      extendTypePack(arena, this.builtinTypes, iterFtv.argTypes, 2);
      const firstIterationArgCount = iterTys.length === 0 ? 0 : iterTys.length - 1;
      const actualArgCount = expectedVariableTypes.head.length;
      if (firstIterationArgCount < minCount) {
        if (isMm) {
          this.reportError(
            { kind: "GenericError", message: "__iter metamethod must return (next[, table[, state]])" },
            getLocation(forInStatement.values),
          );
        } else {
          this.reportError(countMismatch(2, firstIterationArgCount, CountMismatchContext.Arg), forInStatement.values[0]!.location);
        }

        return;
      } else if (actualArgCount < minCount) {
        if (isMm) {
          this.reportError(
            { kind: "GenericError", message: "__iter metamethod must return (next[, table[, state]])" },
            getLocation(forInStatement.values),
          );
        } else {
          this.reportError(countMismatch(2, firstIterationArgCount, CountMismatchContext.Arg), forInStatement.values[0]!.location);
        }

        return;
      }

      const iterFunc = follow(iterTys[0]!);

      const prospectiveArgTypes = iterTys.slice(1);
      const iterFuncArgs = getPack(followPack(iterFtv.argTypes), "TypePack");
      if (iterFuncArgs && iterFuncArgs.head.length > prospectiveArgTypes.length) {
        while (prospectiveArgTypes.length < iterFuncArgs.head.length) prospectiveArgTypes.push(this.builtinTypes.nilType);
      }
      const prospectiveArgs = arena.addTypePack(prospectiveArgTypes);

      const prospectiveRetTypes: TypeId[] = [];
      if (variableTypes.length > 0) prospectiveRetTypes.push(arena.addType(unionType([variableTypes[0]!, this.builtinTypes.nilType])));
      if (variableTypes.length > 1) prospectiveRetTypes.push(variableTypes[1]!);
      const iterFuncRets = getPack(followPack(iterFtv.retTypes), "TypePack");
      if (iterFuncRets && iterFuncRets.head.length > prospectiveRetTypes.length) {
        while (prospectiveRetTypes.length < iterFuncRets.head.length) prospectiveRetTypes.push(this.builtinTypes.anyType);
      }
      const prospectiveRets = arena.addTypePack(prospectiveRetTypes, this.builtinTypes.anyTypePack);

      const prospectiveFunction = arena.addType(functionType(prospectiveArgs, prospectiveRets, { hasSelf: isMm }));

      this.testIsSubtypeForInStat(iterFunc, prospectiveFunction, forInStatement);
    };

    const iteratorNorm = this.normalizer.normalize(iteratorTy);

    if (!iteratorNorm) this.reportError({ kind: "NormalizationTooComplex" }, firstValue.location);

    const nextFn = get(iteratorTy, "FunctionType");
    const ttv = get(iteratorTy, "TableType");
    if (nextFn) {
      checkFunction(nextFn, iteratorTypes.head, false);
    } else if (ttv) {
      if ((forInStatement.vars.length === 1 || forInStatement.vars.length === 2) && ttv.indexer) {
        this.testIsSubtype(variableTypes[0]!, ttv.indexer.indexType, forInStatement.vars[0]!.location);
        if (variableTypes.length === 2) this.testIsSubtype(variableTypes[1]!, ttv.indexer.indexResultType, forInStatement.vars[1]!.location);
      } else {
        this.reportError({ kind: "GenericError", message: "Cannot iterate over a table without indexer" }, forInStatement.values[0]!.location);
      }
    } else if (get(iteratorTy, "AnyType") || get(iteratorTy, "ErrorType") || get(iteratorTy, "NeverType")) {
    } else if (isOptional(iteratorTy) && !(iteratorNorm && iteratorNorm.shouldSuppressErrors())) {
      this.reportError({ kind: "OptionalValueAccess", optional: iteratorTy }, forInStatement.values[0]!.location);
    } else {
      const iterMmTy = findMetatableEntry(this.builtinTypes, this.module.errors, iteratorTy, "__iter", forInStatement.values[0]!.location);
      if (iterMmTy) {
        const instantiation = new Instantiation(arena, this.builtinTypes, new TypeLevel(), scope);

        const instantiatedIterMmTy = instantiate(this.builtinTypes, arena, this.limits, scope, iterMmTy);
        if (instantiatedIterMmTy) {
          const iterMmFtv = get(instantiatedIterMmTy, "FunctionType");
          if (iterMmFtv) {
            const argPack = arena.addTypePack([iteratorTy]);
            this.testIsSubtypePack(argPack, iterMmFtv.argTypes, forInStatement.values[0]!.location);

            const mmIteratorTypes = extendTypePack(arena, this.builtinTypes, iterMmFtv.retTypes, 3);

            if (mmIteratorTypes.head.length === 0) {
              this.reportError({ kind: "GenericError", message: "__iter must return at least one value" }, forInStatement.values[0]!.location);
              return;
            }

            const nextFn = follow(mmIteratorTypes.head[0]!);

            const instantiatedNextFn = instantiation.substitute(nextFn);
            if (instantiatedNextFn) {
              const instantiatedIteratorTypes = [...mmIteratorTypes.head];
              instantiatedIteratorTypes[0] = instantiatedNextFn;

              const nextFtv = get(instantiatedNextFn, "FunctionType");
              if (nextFtv) {
                checkFunction(nextFtv, instantiatedIteratorTypes, true);
              } else if (!this.isErrorSuppressing(forInStatement.values[0]!.location, instantiatedNextFn)) {
                this.reportError({ kind: "CannotCallNonFunction", ty: instantiatedNextFn }, forInStatement.values[0]!.location);
              }
            } else {
              this.reportError({ kind: "UnificationTooComplex" }, forInStatement.values[0]!.location);
            }
          } else if (!this.isErrorSuppressing(forInStatement.values[0]!.location, iterMmTy)) {
            this.reportError({ kind: "CannotCallNonFunction", ty: iterMmTy }, forInStatement.values[0]!.location);
          }
        } else {
          this.reportError({ kind: "UnificationTooComplex" }, forInStatement.values[0]!.location);
        }
      } else if (iteratorNorm && iteratorNorm.hasTables()) {
      } else if (!iteratorNorm || !iteratorNorm.shouldSuppressErrors()) {
        this.reportError({ kind: "CannotCallNonFunction", ty: iteratorTy }, forInStatement.values[0]!.location);
      }
    }
  }

  private getBindingType(expr: AstExpr): TypeId | undefined {
    if (expr instanceof AstExprLocal) {
      const s = this.back();
      return s.lookup(expr.local);
    } else if (expr instanceof AstExprGlobal) {
      const s = this.back();
      return s.lookup(expr.name);
    } else return undefined;
  }

  private reportErrorsFromAssigningToNever(lhs: AstExpr, rhsType: TypeId): void {
    if (lhs instanceof AstExprIndexName) {
      const indexName = lhs;
      const indexedType = this.lookupType(indexName.expr);

      if (get(indexedType, "NeverType")) return;

      const prop = indexName.index;

      const norm = this.normalizer.normalize(indexedType);
      if (!norm) {
        this.reportError({ kind: "NormalizationTooComplex" }, lhs.location);
        return;
      }

      if (norm.shouldSuppressErrors()) return;

      const propTypes = this.lookupProp(norm, prop, ValueContext.LValue, lhs.location, this.builtinTypes.stringType, this.module.errors);

      this.reportError({ kind: "CannotAssignToNever", rhsType, cause: propTypes.typesOfProp, reason: "PropertyNarrowed" }, lhs.location);
    }
  }

  private visitStatAssign(assign: AstStatAssign): void {
    const count = Math.min(assign.vars.length, assign.values.length);

    for (let i = 0; i < count; ++i) {
      const lhs = assign.vars[i]!;
      this.visitExpr(lhs, ValueContext.LValue);
      const lhsType = this.lookupType(lhs);

      const rhs = assign.values[i]!;
      this.visitExpr(rhs, ValueContext.RValue);
      const rhsType = this.lookupType(rhs);

      if (get(lhsType, "NeverType")) {
        this.reportErrorsFromAssigningToNever(lhs, rhsType);
        continue;
      }

      if (this.testLiteralOrAstTypeIsSubtype(rhs, lhsType)) {
        const bindingType = this.getBindingType(lhs);
        if (bindingType) this.testLiteralOrAstTypeIsSubtype(rhs, bindingType);
      }
    }
  }

  private visitStatCompoundAssign(stat: AstStatCompoundAssign): void {
    const resultTy = this.module.astCompoundAssignResultTypes.get(stat);

    if (this.module.constraintGenerationDidNotComplete && !resultTy) return;

    const fake = new AstExprBinary(stat.location, stat.op, stat.variable, stat.value);
    this.module.astTypes.set(fake, resultTy!);
    this.visitExprBinary(fake, stat);
    this.module.astTypes.delete(fake);

    const varTy = this.lookupType(stat.variable);

    this.testIsSubtype(resultTy!, varTy, stat.location);
  }

  private visitStatFunction(stat: AstStatFunction): void {
    this.visitExpr(stat.name, ValueContext.LValue);
    this.visitExprFunction(stat.func);

    const lhsType = this.lookupType(stat.name);
    const rhsType = this.lookupType(stat.func);
    this.testIsSubtype(rhsType, lhsType, stat.func.location);
  }

  private visitStatLocalFunction(stat: AstStatLocalFunction): void {
    this.visitExprFunction(stat.func);
  }

  private visitTypeList(typeList: AstTypeList): void {
    for (const ty of typeList.types) this.visitType(ty);

    if (typeList.tailType) this.visitTypePack(typeList.tailType);
  }

  private visitStatTypeAlias(stat: AstStatTypeAlias): void {
    if (!this.module.astScopes.has(stat)) return;

    const scope = this.findInnermostScope(stat.location);
    const loc = scope.isInvalidTypeAlias(stat.name);
    if (loc) this.reportError({ kind: "RecursiveRestraintViolation" }, loc);

    this.visitGenerics(stat.generics, stat.genericPacks);
    this.visitType(stat.type);
  }

  private visitStatDeclareFunction(stat: AstStatDeclareFunction): void {
    this.visitGenerics(stat.generics, stat.genericPacks);
    this.visitTypeList(stat.params);
    this.visitTypePack(stat.retTypes);
  }

  private visitStatDeclareGlobal(stat: AstStatDeclareGlobal): void {
    this.visitType(stat.type);
  }

  private visitStatDeclareExternType(stat: AstStatDeclareExternType): void {
    for (const prop of stat.props) this.visitType(prop.ty);
  }

  private visitStatError(stat: AstStatError): void {
    for (const expr of stat.expressions) this.visitExpr(expr, ValueContext.RValue);

    for (const s of stat.statements) this.visitStat(s);
  }

  private visitExpr(expr: AstExpr, context: ValueContext): void {
    const pushed = this.pushStack(expr);
    try {
      if (expr instanceof AstExprGroup) return this.visitExprGroup(expr, context);
      else if (expr instanceof AstExprConstantNil) return;
      else if (expr instanceof AstExprConstantBool) return this.visitExprConstantBool(expr);
      else if (expr instanceof AstExprConstantNumber) return;
      else if (expr instanceof AstExprConstantString) return this.visitExprConstantString(expr);
      else if (expr instanceof AstExprLocal) return;
      else if (expr instanceof AstExprGlobal) return this.visitExprGlobal(expr);
      else if (expr instanceof AstExprVarargs) return;
      else if (expr instanceof AstExprCall) return this.visitExprCall(expr);
      else if (expr instanceof AstExprIndexName) return this.visitExprIndexName(expr, context);
      else if (expr instanceof AstExprIndexExpr) return this.visitExprIndexExpr(expr, context);
      else if (expr instanceof AstExprFunction) return this.visitExprFunction(expr);
      else if (expr instanceof AstExprTable) return this.visitExprTable(expr);
      else if (expr instanceof AstExprUnary) return this.visitExprUnary(expr);
      else if (expr instanceof AstExprBinary) {
        this.visitExprBinary(expr);
        return;
      } else if (expr instanceof AstExprTypeAssertion) return this.visitExprTypeAssertion(expr);
      else if (expr instanceof AstExprIfElse) return this.visitExprIfElse(expr);
      else if (expr instanceof AstExprInstantiate) return this.visitExprInstantiate(expr);
      else if (expr instanceof AstExprInterpString) return this.visitExprInterpString(expr);
      else if (expr instanceof AstExprError) return this.visitExprError(expr);
      else if (sparkdownValue(expr)) {
        for (const operand of sparkdownValue(expr)!.operands) this.visitExpr(operand, ValueContext.RValue);
      }
    } finally {
      if (pushed) this.stack.pop();
    }
  }

  private visitExprGroup(expr: AstExprGroup, context: ValueContext): void {
    this.visitExpr(expr.expr, context);
  }

  private visitExprConstantBool(expr: AstExprConstantBool): void {
    const bestType = expr.value ? this.builtinTypes.trueType : this.builtinTypes.falseType;
    const inferredType = this.lookupType(expr);
    const scope = this.findInnermostScope(expr.location);

    const r = this.subtyping.isSubtype(bestType, inferredType, scope);
    if (!r.isErrorSuppressing) {
      if (!r.isSubtype) this.reportError(typeMismatch(inferredType, bestType), expr.location);
      this.reportErrors(atLocation(r.errors, expr.location));
    }
  }

  private visitExprConstantString(expr: AstExprConstantString): void {
    const bestType = this.module.internalTypes.addType(stringSingleton(expr.value));
    const inferredType = this.lookupType(expr);
    const scope = this.findInnermostScope(expr.location);

    const r = this.subtyping.isSubtype(bestType, inferredType, scope);
    if (!this.isErrorSuppressing(expr.location, inferredType)) {
      if (!r.isSubtype) this.reportError(typeMismatch(inferredType, bestType), expr.location);
      this.reportErrors(atLocation(r.errors, expr.location));
    }
  }

  private visitExprGlobal(expr: AstExprGlobal): void {
    const scope = this.back();
    if (!scope.lookup(expr.name)) {
      this.reportError({ kind: "UnknownSymbol", name: expr.name, context: UnknownSymbolContext.Binding }, expr.location);
    } else {
      if (scope.shouldWarnGlobal(expr.name) && !this.warnedGlobals.has(expr.name)) {
        this.reportError({ kind: "UnknownSymbol", name: expr.name, context: UnknownSymbolContext.Binding }, expr.location);
        this.warnedGlobals.add(expr.name);
      }
    }
  }

  private visitCall(call: AstExprCall): void {
    const args: TypePack = typePack([]);
    const argExprs: AstExpr[] = [];
    const scope = this.findInnermostScope(call.location);

    const originalCallTy = this.module.astOriginalCallTypes.get(call.func);
    const selectedOverloadTy = this.module.astOverloadResolvedTypes.get(call);
    if (!originalCallTy) return;

    let fnTy = follow(originalCallTy);

    if (get(fnTy, "AnyType") || get(fnTy, "ErrorType") || get(fnTy, "NeverType")) return;
    else if (isOptional(fnTy)) {
      const suppression = shouldSuppressErrors(this.normalizer, fnTy);
      if (suppression === ErrorSuppression.NormalizationFailed) this.reportError({ kind: "NormalizationTooComplex" }, call.func.location);
      if (suppression !== ErrorSuppression.Suppress) this.reportError({ kind: "OptionalValueAccess", optional: fnTy }, call.func.location);
      return;
    }

    if (call.typeArguments.length) {
      this.checkTypeInstantiation(call, fnTy, call.location, call.typeArguments);
    }

    if (selectedOverloadTy) {
      const result = this.subtyping.isSubtype(originalCallTy, selectedOverloadTy, scope);
      if (result.isSubtype) fnTy = follow(selectedOverloadTy);

      this.reportErrors(result.isErrorSuppressing ? atLocation(result.errors, call.location) : result.errors);
      if (result.normalizationTooComplex) {
        this.reportError({ kind: "NormalizationTooComplex" }, call.func.location);
        return;
      }
    }

    if (call.self) {
      const indexExpr = call.func instanceof AstExprIndexName ? call.func : undefined;
      if (!indexExpr) {
        this.reportError({ kind: "InternalError", message: "method call expression has no 'self'" }, call.location);
        return;
      }

      args.head.push(this.lookupType(indexExpr.expr));
      argExprs.push(indexExpr.expr);
    }

    const fty = get(fnTy, "FunctionType");
    if (fty && fty.generics.length === 0 && fty.genericPacks.length === 0 && call.args.length > 0) {
      const selfOffset = call.self ? 1 : 0;

      const paramsHead = extendTypePack(this.module.internalTypes, this.builtinTypes, fty.argTypes, call.args.length + selfOffset).head;

      for (let idx = 0; idx < call.args.length; ++idx) {
        const argExpr = call.args[idx]!;
        argExprs.push(argExpr);

        if (idx + selfOffset < paramsHead.length) {
          if (this.testSetMetatableCallIsSubtype(argExpr, paramsHead[idx + selfOffset]!) !== undefined) {
            args.head.push(paramsHead[idx + selfOffset]!);
            continue;
          }
        }

        if (idx === call.args.length - 1) {
          const lastArgPack = this.module.astTypePacks.get(argExpr);
          if (lastArgPack) {
            const { head: lastArgHead, tail: lastArgTail } = flatten(lastArgPack);
            args.head.push(...lastArgHead);
            args.tail = lastArgTail;
            continue;
          }
        }

        const argExprType = this.lookupType(argExpr);
        if (idx + selfOffset >= paramsHead.length || this.isErrorSuppressing(argExpr.location, argExprType)) {
          args.head.push(argExprType);
        } else {
          this.testLiteralOrAstTypeIsSubtype(argExpr, paramsHead[idx + selfOffset]!);
          args.head.push(paramsHead[idx + selfOffset]!);
        }
      }
    } else {
      for (let i = 0; i < call.args.length; ++i) {
        const arg = call.args[i]!;
        argExprs.push(arg);
        const argTy = this.module.astTypes.get(arg);
        if (argTy) args.head.push(argTy);
        else if (i === call.args.length - 1) {
          const argTail = this.module.astTypePacks.get(arg);
          if (argTail) {
            const { head, tail } = flatten(argTail);
            args.head.push(...head);
            args.tail = tail;
          } else args.tail = this.builtinTypes.anyTypePack;
        } else args.head.push(this.builtinTypes.anyType);
      }
    }

    const argsTp = this.module.internalTypes.addTypePack([...args.head], args.tail);
    const ftv = get(follow(originalCallTy), "FunctionType");
    if (ftv) {
      if (ftv.magic) {
        const usedMagic =
          ftv.magic.typeCheck?.({
            typechecker: this,
            builtinTypes: this.builtinTypes,
            callSite: call,
            arguments: argsTp,
            checkScope: scope,
          }) ?? false;
        if (usedMagic) return;
      }
    }

    const resolver = new OverloadResolver(
      this.builtinTypes,
      this.module.internalTypes,
      this.normalizer,
      this.typeFunctionRuntime,
      this.back(),
      this.limits,
      call.location,
    );
    const uniqueTypes = new Set<TypeId>();
    findUniqueTypesIn(uniqueTypes, argExprs, this.module.astTypes);

    const argsPack = this.module.internalTypes.addTypePack([...args.head], args.tail);
    const result2 = resolver.resolveOverload(fnTy, argsPack, call.func.location, uniqueTypes, false);

    if (result2.potentialOverloads.length > 0) {
      this.reportError({ kind: "InternalError", message: "Internal error: outstanding free or blocked type in function call" }, call.location);
    }

    if (result2.ok.length > 0) {
      if (result2.ok.length > 1) this.reportError({ kind: "AmbiguousFunctionCall", function: fnTy, arguments: argsPack }, call.location);
      return;
    }

    const overloadsToReport: TypeId[] = [];

    if (result2.incompatibleOverloads.length === 1) {
      for (const [ty, reasons] of result2.incompatibleOverloads) {
        let reportedArgs = argsPack;
        const reportedExprs = [...argExprs];

        if (result2.metamethods.has(ty)) {
          reportedArgs = this.module.internalTypes.addTypePack([fnTy], argsPack);
          reportedExprs.unshift(call.func);
        }

        if (!Array.isArray(reasons)) {
          for (const reason of reasons) {
            resolver.reportErrors(this.module.errors, ty, call.func.location, this.module.name, reportedArgs, reportedExprs, reason);
          }
        } else {
          this.reportErrors(reasons);
        }
      }

      return;
    }

    const { head: argHead } = flatten(argsPack);
    if (result2.incompatibleOverloads.length > 1) {
      for (const [overloadTy] of result2.incompatibleOverloads) {
        if (!this.isErrorSuppressing(call.location, overloadTy)) overloadsToReport.push(overloadTy);
      }

      if (overloadsToReport.length > 0) {
        this.reportError({ kind: "MultipleNonviableOverloads", attemptedArgCount: argHead.length }, call.location);
        reportAvailableOverloads(this.module.errors, call.location, this.module.name, overloadsToReport);
      }

      return;
    }

    if (result2.arityMismatches.length === 1) {
      const fnTy = follow(result2.arityMismatches[0]!);
      const fn = get(fnTy, "FunctionType");

      if (fn) {
        const isVariadicArgs = isVariadic(fn.argTypes);

        const { min: minParams, max: optMaxParams } = getParameterExtents(fn.argTypes);
        this.reportError(
          countMismatch(minParams, argHead.length, CountMismatchContext.Arg, { maximum: optMaxParams, isVariadic: isVariadicArgs }),
          call.func.location,
        );
        return;
      }
    }

    if (result2.arityMismatches.length > 0) {
      this.reportError({ kind: "GenericError", message: `No overload for function accepts ${argHead.length} arguments.` }, call.func.location);
      reportAvailableOverloads(this.module.errors, call.func.location, this.module.name, result2.arityMismatches);
      return;
    }

    if (result2.nonFunctions.length > 0) {
      const norm = this.normalizer.normalize(fnTy);
      if (!norm || this.normalizer.isInhabitedNormal(norm) === NormalizationResult.HitLimits) {
        this.reportError({ kind: "NormalizationTooComplex" }, call.func.location);
      }
      else if (!norm.shouldSuppressErrors()) this.reportError({ kind: "CannotCallNonFunction", ty: fnTy }, call.func.location);
      return;
    }
  }

  private visitExprCall(call: AstExprCall): void {
    const oldContext = this.typeContext;

    if (!matchTypeOf(call)) this.typeContext = TypeContext.Default;

    try {
      this.visitExpr(call.func, ValueContext.RValue);
      this.visitTypeArguments(call.typeArguments);

      if (matchAssert(call) && call.args.length > 0) {
        this.inConditionalContext(() => this.visitExpr(call.args[0]!, ValueContext.RValue));

        for (let i = 1; i < call.args.length; ++i) this.visitExpr(call.args[i]!, ValueContext.RValue);
      } else {
        for (const arg of call.args) this.visitExpr(arg, ValueContext.RValue);
      }

      this.visitCall(call);
    } finally {
      this.typeContext = oldContext;
    }
  }

  private tryStripUnionFromNil(ty: TypeId): TypeId | undefined {
    const utv = get(ty, "UnionType");
    if (utv) {
      if (!flatOptions(utv).some(isNil)) return ty;

      const result: TypeId[] = [];

      for (const option of flatOptions(utv)) {
        if (!isNil(option)) result.push(option);
      }

      if (result.length === 0) return undefined;

      return result.length === 1 ? result[0]! : this.module.internalTypes.addType(unionType(result));
    }

    return undefined;
  }

  private stripFromNilAndReport(ty: TypeId, location: Location): TypeId {
    ty = follow(ty);

    const utv = get(ty, "UnionType");
    if (utv) {
      if (!flatOptions(utv).some(isNil)) return ty;
    }

    const strippedUnion = this.tryStripUnionFromNil(ty);
    if (strippedUnion) {
      const suppression = shouldSuppressErrors(this.normalizer, ty);
      if (suppression === ErrorSuppression.NormalizationFailed) this.reportError({ kind: "NormalizationTooComplex" }, location);
      if (suppression !== ErrorSuppression.Suppress) this.reportError({ kind: "OptionalValueAccess", optional: ty }, location);

      return follow(strippedUnion);
    }

    return ty;
  }

  private visitExprName(expr: AstExpr, location: Location, propName: string, context: ValueContext, astIndexExprTy: TypeId): void {
    this.visitExpr(expr, ValueContext.RValue);
    const leftType = this.stripFromNilAndReport(this.lookupType(expr), location);
    this.checkIndexTypeFromType(leftType, propName, context, location, astIndexExprTy);
  }

  private visitExprIndexName(indexName: AstExprIndexName, context: ValueContext): void {
    this.visitExprName(indexName.expr, indexName.location, indexName.index, context, this.builtinTypes.stringType);
  }

  private indexExprMetatableHelper(indexExpr: AstExprIndexExpr, metaTable: MetatableType, exprType: TypeId, indexType: TypeId): void {
    const tt = get(follow(metaTable.table), "TableType");
    const mt = get(follow(metaTable.table), "MetatableType");
    const tmt = get(follow(metaTable.metatable), "TableType");
    const mtmt = get(follow(metaTable.metatable), "MetatableType");
    if (tt && tt.indexer) this.testIsSubtype(indexType, tt.indexer.indexType, indexExpr.index.location);
    else if (mt) this.indexExprMetatableHelper(indexExpr, mt, exprType, indexType);
    else if (tmt && tmt.indexer) this.testIsSubtype(indexType, tmt.indexer.indexType, indexExpr.index.location);
    else if (mtmt) this.indexExprMetatableHelper(indexExpr, mtmt, exprType, indexType);
    else {
      this.reportError(
        { kind: "CannotExtendTable", tableType: exprType, context: CannotExtendTableContext.Indexer, prop: "indexer??" },
        indexExpr.location,
      );
    }
  }

  private visitExprIndexExpr(indexExpr: AstExprIndexExpr, context: ValueContext): void {
    if (indexExpr.index instanceof AstExprConstantString) {
      const str = indexExpr.index;
      const astIndexExprType = this.lookupType(indexExpr.index);
      const stringValue = str.value;
      this.visitExprName(indexExpr.expr, indexExpr.location, stringValue, context, astIndexExprType);
      return;
    }

    this.visitExpr(indexExpr.expr, ValueContext.RValue);
    this.visitExpr(indexExpr.index, ValueContext.RValue);

    const exprType = follow(this.lookupType(indexExpr.expr));
    const indexType = follow(this.lookupType(indexExpr.index));

    const tt = get(exprType, "TableType");
    const mt = get(exprType, "MetatableType");
    const cls = get(exprType, "ExternType");
    const ut = get(exprType, "UnionType");
    const it = get(exprType, "IntersectionType");
    if (tt) {
      if (tt.indexer) {
        this.testIsSubtype(indexType, tt.indexer.indexType, indexExpr.index.location);
        if (context === ValueContext.LValue && tt.indexer.isReadOnly) {
          this.reportError(
            { kind: "PropertyAccessViolation", table: exprType, key: "indexer", context: PropertyAccessViolationContext.CannotWrite },
            indexExpr.location,
          );
        }
      } else {
        this.reportError(
          { kind: "CannotExtendTable", tableType: exprType, context: CannotExtendTableContext.Indexer, prop: "indexer??" },
          indexExpr.location,
        );
      }
    } else if (mt) {
      return this.indexExprMetatableHelper(indexExpr, mt, exprType, indexType);
    } else if (cls) {
      if (cls.indexer) this.testIsSubtype(indexType, cls.indexer.indexType, indexExpr.index.location);
      else this.reportError({ kind: "DynamicPropertyLookupOnExternTypesUnsafe", ty: exprType }, indexExpr.location);
    } else if (ut && isOptional(exprType)) {
      const suppression = shouldSuppressErrors(this.normalizer, exprType);
      if (suppression === ErrorSuppression.NormalizationFailed) this.reportError({ kind: "NormalizationTooComplex" }, indexExpr.location);
      if (suppression !== ErrorSuppression.Suppress) this.reportError({ kind: "OptionalValueAccess", optional: exprType }, indexExpr.location);
    } else if (ut) {
      if (!flatOptions(ut).every((t) => getTableType(t) !== undefined)) {
        const suppression = shouldSuppressErrors(this.normalizer, exprType);
        if (suppression === ErrorSuppression.NormalizationFailed) this.reportError({ kind: "NormalizationTooComplex" }, indexExpr.location);
        if (suppression !== ErrorSuppression.Suppress) this.reportError({ kind: "NotATable", ty: exprType }, indexExpr.location);
      }
    } else if (it) {
      if (!flatOptions(it).some((t) => getTableType(t) !== undefined)) this.reportError({ kind: "NotATable", ty: exprType }, indexExpr.location);
    } else if (get(exprType, "NeverType") || this.isErrorSuppressing(indexExpr.location, exprType)) {
    } else this.reportError({ kind: "NotATable", ty: exprType }, indexExpr.location);
  }

  private visitExprFunction(fn: AstExprFunction): void {
    const oldContext = this.typeContext;
    this.typeContext = TypeContext.Default;

    const pushed = this.pushStack(fn);
    try {
      this.visitGenerics(fn.generics, fn.genericPacks);

      const inferredFnTy = this.lookupType(fn);
      this.functionDeclStack.push(inferredFnTy);

      let normalizedFnTy = this.normalizer.normalize(inferredFnTy);
      if (!normalizedFnTy) {
        this.reportError({ kind: "CodeTooComplex" }, fn.location);
      } else if (get(normalizedFnTy.errors, "ErrorType")) {
        normalizedFnTy = undefined;
      } else if (!normalizedFnTy.hasFunctions()) {
        this.reportError({ kind: "InternalError", message: "Internal error: Lambda has non-function type " + toString(inferredFnTy) }, fn.location);
        return;
      } else {
        if (normalizedFnTy.functions.parts.size !== 1) {
          this.reportError({ kind: "InternalError", message: "Unexpected: Lambda has unexpected type " + toString(inferredFnTy) }, fn.location);
          return;
        }

        const inferredFtv = get(normalizedFnTy.functions.parts.front(), "FunctionType")!;

        const argTypes = flatten(inferredFtv.argTypes).head;
        let argIt = 0;
        if (fn.self) ++argIt;

        for (const arg of fn.args) {
          if (argIt >= argTypes.length) break;

          const inferredArgTy = argTypes[argIt]!;

          if (arg.annotation) {
            this.visitType(arg.annotation);

            const annotatedArgTy = this.lookupAnnotation(arg.annotation);

            this.testIsSubtype(inferredArgTy, annotatedArgTy, arg.location);
          }

          if (is(follow(inferredArgTy), "NeverType")) {
            let explicitlyNever = false;
            if (arg.annotation) {
              const annotatedArgTy = this.lookupAnnotation(arg.annotation);
              explicitlyNever = is(annotatedArgTy, "NeverType");
            }

            const contributors = this.module.upperBoundContributors.get(inferredArgTy);
            if (contributors && !explicitlyNever) {
              this.reportError(
                {
                  kind: "GenericError",
                  message: `Parameter '${arg.name}' has been reduced to never. This function is not callable with any possible value.`,
                },
                arg.location,
              );
              for (const [site, component] of contributors) {
                this.reportError(
                  { kind: "ExtraInformation", message: `Parameter '${arg.name}' is required to be a subtype of '${toString(component)}' here.` },
                  site,
                );
              }
            }
          }

          ++argIt;
        }

        if (fn.vararg && fn.varargAnnotation) this.visitTypePack(fn.varargAnnotation);

        const reachesImplicitReturn = getFallthrough(fn.body) !== undefined;
        if (reachesImplicitReturn && !TypeChecker2.allowsNoReturnValues(followPack(inferredFtv.retTypes))) {
          this.reportError({ kind: "FunctionExitsWithoutReturning", expectedReturnType: inferredFtv.retTypes }, TypeChecker2.getEndLocation(fn));
        }
      }

      this.visit(fn.body);

      if (fn.returnAnnotation) this.visitTypePack(fn.returnAnnotation);

      if (normalizedFnTy) this.suggestAnnotations(fn, normalizedFnTy.functions.parts.front());

      this.functionDeclStack.pop();
    } finally {
      if (pushed) this.stack.pop();
      this.typeContext = oldContext;
    }
  }

  private visitExprTable(expr: AstExprTable): void {
    this.inConditionalContext(() => {
      for (const item of expr.items) {
        if (item.key) this.visitExpr(item.key, ValueContext.RValue);
        this.visitExpr(item.value, ValueContext.RValue);
      }
    }, TypeContext.Default);
  }

  private visitExprUnary(expr: AstExprUnary): void {
    const oldContext = this.typeContext;
    if (expr.op !== UnaryOp.Not) this.typeContext = TypeContext.Default;

    try {
      this.visitExpr(expr.expr, ValueContext.RValue);

      const operandType = this.lookupType(expr.expr);
      const resultType = this.lookupType(expr);

      if (this.isErrorSuppressing(expr.expr.location, operandType)) return;

      const metamethod = kUnaryOpMetamethods.get(expr.op);
      if (metamethod !== undefined) {
        const mm = findMetatableEntry(this.builtinTypes, this.module.errors, operandType, metamethod, expr.location);
        if (mm) {
          const ftv = get(follow(mm), "FunctionType");
          if (ftv) {
            const ret = first(ftv.retTypes);
            if (ret) {
              if (expr.op === UnaryOp.Len) {
                this.testIsSubtype(follow(ret), this.builtinTypes.numberType, expr.location);
              }
            } else {
              this.reportError({ kind: "GenericError", message: `Metamethod '${metamethod}' must return a value` }, expr.location);
            }

            const firstArg = first(ftv.argTypes);
            if (!firstArg) {
              this.reportError({ kind: "GenericError", message: "__unm metamethod must accept one argument" }, expr.location);
              return;
            }

            const expectedArgs = this.module.internalTypes.addTypePack([operandType]);
            const expectedRet = this.module.internalTypes.addTypePack([resultType]);

            const expectedFunction = this.module.internalTypes.addType(functionType(expectedArgs, expectedRet));

            const success = this.testIsSubtype(mm, expectedFunction, expr.location);
            if (!success) return;
          }

          return;
        }
      }

      if (expr.op === UnaryOp.Len) {
        const seen = new Set<TypeId>();
        const nty = this.normalizer.normalize(operandType);

        if (nty && nty.shouldSuppressErrors()) return;

        switch (this.normalizer.isInhabitedNormal(nty)) {
          case NormalizationResult.True:
            break;
          case NormalizationResult.False:
            return;
          case NormalizationResult.HitLimits:
            this.reportError({ kind: "NormalizationTooComplex" }, expr.location);
            return;
        }

        if (!hasLength(operandType, seen)) {
          if (isOptional(operandType)) this.reportError({ kind: "OptionalValueAccess", optional: operandType }, expr.location);
          else this.reportError({ kind: "NotATable", ty: operandType }, expr.location);
        }
      } else if (expr.op === UnaryOp.Minus) {
        this.testIsSubtype(operandType, this.builtinTypes.numberType, expr.location);
      } else if (expr.op === UnaryOp.Not) {
      }
    } finally {
      this.typeContext = oldContext;
    }
  }

  private visitExprBinary(expr: AstExprBinary, overrideKey?: AstNode): TypeId {
    const oldContext = this.typeContext;
    if (expr.op !== BinaryOp.And && expr.op !== BinaryOp.Or && expr.op !== BinaryOp.CompareEq && expr.op !== BinaryOp.CompareNe) {
      this.typeContext = TypeContext.Default;
    }

    try {
      if (overrideKey && overrideKey instanceof AstStatCompoundAssign) this.visitExpr(expr.left, ValueContext.LValue);

      this.visitExpr(expr.left, ValueContext.RValue);
      this.visitExpr(expr.right, ValueContext.RValue);

      const scope = this.back();

      const isEquality = expr.op === BinaryOp.CompareEq || expr.op === BinaryOp.CompareNe;
      const isComparison = isComparisonOp(expr.op);
      const isLogical = expr.op === BinaryOp.And || expr.op === BinaryOp.Or;

      let leftType = follow(this.lookupType(expr.left));
      let rightType = follow(this.lookupType(expr.right));
      const expectedResult = follow(this.lookupType(expr));

      if (get(expectedResult, "TypeFunctionInstanceType")) {
        this.checkForInternalTypeFunction(expectedResult, expr.location);
        return expectedResult;
      }

      if (expr.op === BinaryOp.Or) {
        leftType = stripNil(this.builtinTypes, this.module.internalTypes, leftType);
      }

      const normLeft = this.normalizer.normalize(leftType);
      const normRight = this.normalizer.normalize(rightType);

      const isStringOperation =
        (normLeft ? normLeft.isSubtypeOfString() : isString(leftType)) && (normRight ? normRight.isSubtypeOfString() : isString(rightType));
      leftType = follow(leftType);
      if (get(leftType, "AnyType") || get(leftType, "ErrorType") || get(leftType, "NeverType")) return leftType;
      else if (get(rightType, "AnyType") || get(rightType, "ErrorType") || get(rightType, "NeverType")) return rightType;
      else if ((normLeft && normLeft.shouldSuppressErrors()) || (normRight && normRight.shouldSuppressErrors())) {
        return this.builtinTypes.anyType;
      }

      if ((get(leftType, "BlockedType") || get(leftType, "FreeType") || get(leftType, "GenericType")) && !isEquality && !isLogical) {
        const name = getIdentifierOfBaseVar(expr.left);
        this.reportError(
          {
            kind: "CannotInferBinaryOperation",
            op: expr.op,
            suggestedToAnnotate: name,
            opKind: isComparison ? CannotInferBinaryOperationKind.Comparison : CannotInferBinaryOperationKind.Operation,
          },
          expr.location,
        );
        return leftType;
      }

      const typesHaveIntersection = this.normalizer.isIntersectionInhabited(leftType, rightType);

      if (isEquality || isComparison) {
        if (!isOkToCompare(this.normalizer, typesHaveIntersection, normLeft, normRight)) {
          this.reportError({ kind: "CannotCompareUnrelatedTypes", left: leftType, right: rightType, op: expr.op }, expr.location);
          return this.builtinTypes.errorType;
        }

        const eitherExprIsNil = (normLeft && normLeft.isNil()) || (normRight && normRight.isNil());

        if (isEquality && eitherExprIsNil) return this.builtinTypes.booleanType;
      }
      const metamethod = kBinaryOpMetamethods.get(expr.op);
      if (metamethod !== undefined) {
        const leftMt = getMetatable(leftType, this.builtinTypes);
        const rightMt = getMetatable(rightType, this.builtinTypes);
        let matches = leftMt === rightMt;

        if (isEquality && !matches) {
          const testUnion = (utv: UnionType, otherMt: TypeId | undefined): void => {
            for (const option of flatOptions(utv)) {
              if (getMetatable(follow(option), this.builtinTypes) === otherMt) {
                matches = true;
                break;
              }
            }
          };

          const leftUtv = get(leftType, "UnionType");
          if (leftUtv && rightMt) {
            testUnion(leftUtv, rightMt);
          }

          const rightUtv = get(rightType, "UnionType");
          if (rightUtv && leftMt && !matches) {
            testUnion(rightUtv, leftMt);
          }
        }

        if (!(get(leftType, "TableType") || get(rightType, "TableType"))) {
          if (leftMt === undefined || rightMt === undefined) matches = matches || typesHaveIntersection !== NormalizationResult.False;
        }

        if (!matches && isComparison) {
          this.reportError(
            {
              kind: "GenericError",
              message: `Types ${toString(leftType)} and ${toString(rightType)} cannot be compared with ${binaryOpToString(expr.op)} because they do not have the same metatable`,
            },
            expr.location,
          );

          return this.builtinTypes.errorType;
        }

        let mm: TypeId | undefined;
        const leftMm = findMetatableEntry(this.builtinTypes, this.module.errors, leftType, metamethod, expr.left.location);
        if (leftMm) mm = leftMm;
        else {
          const rightMm = findMetatableEntry(this.builtinTypes, this.module.errors, rightType, metamethod, expr.right.location);
          if (rightMm) {
            mm = rightMm;
            [leftType, rightType] = [rightType, leftType];
          }
        }

        if (mm) {
          let key: AstNode = expr;
          if (overrideKey !== undefined) key = overrideKey;

          const selectedOverloadTy = this.module.astOverloadResolvedTypes.get(key);
          if (!selectedOverloadTy) {
            return expectedResult;
          }

          const ftv = get(follow(selectedOverloadTy), "FunctionType");
          if (ftv) {
            let expectedArgs: TypePackId;
            if (expr.op === BinaryOp.CompareGe || expr.op === BinaryOp.CompareGt) {
              expectedArgs = this.module.internalTypes.addTypePack([rightType, leftType]);
            } else {
              expectedArgs = this.module.internalTypes.addTypePack([leftType, rightType]);
            }

            let expectedRets: TypePackId;
            if (
              expr.op === BinaryOp.CompareEq ||
              expr.op === BinaryOp.CompareNe ||
              expr.op === BinaryOp.CompareGe ||
              expr.op === BinaryOp.CompareGt ||
              expr.op === BinaryOp.CompareLe ||
              expr.op === BinaryOp.CompareLt
            ) {
              expectedRets = this.module.internalTypes.addTypePack([this.builtinTypes.booleanType]);
            } else {
              expectedRets = this.module.internalTypes.addTypePack([this.module.internalTypes.freshType(this.builtinTypes, scope)]);
            }

            const expectedTy = this.module.internalTypes.addType(functionType(expectedArgs, expectedRets));

            this.testIsSubtype(follow(mm), expectedTy, expr.location);

            const ret = first(ftv.retTypes);
            if (ret) {
              if (isComparison) {
                if (!isBoolean(follow(ret))) {
                  this.reportError({ kind: "GenericError", message: `Metamethod '${metamethod}' must return a boolean` }, expr.location);
                }

                return this.builtinTypes.booleanType;
              } else {
                return follow(ret);
              }
            } else {
              if (isComparison) {
                this.reportError({ kind: "GenericError", message: `Metamethod '${metamethod}' must return a boolean` }, expr.location);
              } else {
                this.reportError({ kind: "GenericError", message: `Metamethod '${metamethod}' must return a value` }, expr.location);
              }

              return this.builtinTypes.errorType;
            }
          } else {
            this.reportError({ kind: "CannotCallNonFunction", ty: mm }, expr.location);
          }

          return this.builtinTypes.errorType;
        }
        else if (!isEquality && !(isStringOperation && (expr.op === BinaryOp.Concat || isComparison))) {
          if ((leftMt && !isString(leftType)) || (rightMt && !isString(rightType))) {
            if (isComparison) {
              this.reportError({ kind: "CannotCompareUnrelatedTypes", left: leftType, right: rightType, op: expr.op }, expr.location);
            } else {
              this.reportError(
                {
                  kind: "GenericError",
                  message: `Operator ${binaryOpToString(expr.op)} is not applicable for '${toString(leftType)}' and '${toString(rightType)}' because neither type's metatable has a '${metamethod}' metamethod`,
                },
                expr.location,
              );
            }

            return this.builtinTypes.errorType;
          } else if (!leftMt && !rightMt && (get(leftType, "TableType") || get(rightType, "TableType"))) {
            if (isComparison) {
              this.reportError({ kind: "CannotCompareUnrelatedTypes", left: leftType, right: rightType, op: expr.op }, expr.location);
            } else {
              this.reportError(
                {
                  kind: "GenericError",
                  message: `Operator ${binaryOpToString(expr.op)} is not applicable for '${toString(leftType)}' and '${toString(rightType)}' because neither type has a metatable`,
                },
                expr.location,
              );
            }

            return this.builtinTypes.errorType;
          }
        }
      }

      switch (expr.op) {
        case BinaryOp.Add:
        case BinaryOp.Sub:
        case BinaryOp.Mul:
        case BinaryOp.Div:
        case BinaryOp.FloorDiv:
        case BinaryOp.Pow:
        case BinaryOp.Mod:
          this.testIsSubtype(leftType, this.builtinTypes.numberType, expr.left.location);
          this.testIsSubtype(rightType, this.builtinTypes.numberType, expr.right.location);

          return this.builtinTypes.numberType;
        case BinaryOp.Concat: {
          const numberOrString = this.module.internalTypes.addType(unionType([this.builtinTypes.numberType, this.builtinTypes.stringType]));
          this.testIsSubtype(leftType, numberOrString, expr.left.location);
          this.testIsSubtype(rightType, numberOrString, expr.right.location);
          return this.builtinTypes.stringType;
        }
        case BinaryOp.CompareGe:
        case BinaryOp.CompareGt:
        case BinaryOp.CompareLe:
        case BinaryOp.CompareLt: {
          if (normLeft && normLeft.shouldSuppressErrors()) return this.builtinTypes.booleanType;

          if (normLeft && this.normalizer.isInhabitedNormal(normLeft) === NormalizationResult.False) return this.builtinTypes.booleanType;

          if (this.subtyping.isSubtype(leftType, this.builtinTypes.numberType, scope).isSubtype) {
            this.testIsSubtype(rightType, this.builtinTypes.numberType, expr.right.location);
            return this.builtinTypes.booleanType;
          }

          if (this.subtyping.isSubtype(leftType, this.builtinTypes.stringType, scope).isSubtype) {
            this.testIsSubtype(rightType, this.builtinTypes.stringType, expr.right.location);
            return this.builtinTypes.booleanType;
          }

          this.reportError(
            {
              kind: "GenericError",
              message: `Types '${toString(leftType)}' and '${toString(rightType)}' cannot be compared with relational operator ${binaryOpToString(expr.op)}`,
            },
            expr.location,
          );
          return this.builtinTypes.errorType;
        }

        case BinaryOp.And:
        case BinaryOp.Or:
        case BinaryOp.CompareEq:
        case BinaryOp.CompareNe:
          return this.builtinTypes.anyType;
        default:
          return this.builtinTypes.errorType;
      }
    } finally {
      this.typeContext = oldContext;
    }
  }

  private visitExprTypeAssertion(expr: AstExprTypeAssertion): void {
    this.visitExpr(expr.expr, ValueContext.RValue);
    this.visitType(expr.annotation);

    const annotationType = this.lookupAnnotation(expr.annotation);
    const computedType = this.lookupType(expr.expr);

    switch (orElse(shouldSuppressErrors(this.normalizer, computedType), shouldSuppressErrors(this.normalizer, annotationType))) {
      case ErrorSuppression.Suppress:
        return;
      case ErrorSuppression.NormalizationFailed:
        this.reportError({ kind: "NormalizationTooComplex" }, expr.location);
        return;
      case ErrorSuppression.DoNotSuppress:
        break;
    }

    switch (this.normalizer.isInhabited(computedType)) {
      case NormalizationResult.True:
        break;
      case NormalizationResult.False:
        return;
      case NormalizationResult.HitLimits:
        this.reportError({ kind: "NormalizationTooComplex" }, expr.location);
        return;
    }

    switch (this.normalizer.isIntersectionInhabited(computedType, annotationType)) {
      case NormalizationResult.True:
        return;
      case NormalizationResult.False:
        this.reportError({ kind: "TypesAreUnrelated", left: computedType, right: annotationType }, expr.location);
        break;
      case NormalizationResult.HitLimits:
        this.reportError({ kind: "NormalizationTooComplex" }, expr.location);
        break;
    }
  }

  private visitExprIfElse(expr: AstExprIfElse): void {
    this.inConditionalContext(() => {
      this.inConditionalContext(() => this.visitExpr(expr.condition, ValueContext.RValue), TypeContext.Condition);
      this.visitExpr(expr.trueExpr, ValueContext.RValue);
      this.visitExpr(expr.falseExpr, ValueContext.RValue);
    }, TypeContext.Default);
  }

  private visitExprInstantiate(explicitTypeInstantiation: AstExprInstantiate): void {
    this.visitExpr(explicitTypeInstantiation.expr, ValueContext.RValue);
    this.visitTypeArguments(explicitTypeInstantiation.typeArguments);
    this.checkTypeInstantiation(
      explicitTypeInstantiation.expr,
      this.lookupType(explicitTypeInstantiation.expr),
      explicitTypeInstantiation.location,
      explicitTypeInstantiation.typeArguments,
    );
  }

  private visitExprInterpString(interpString: AstExprInterpString): void {
    this.inConditionalContext(() => {
      for (const expr of interpString.expressions) this.visitExpr(expr, ValueContext.RValue);
    }, TypeContext.Default);
  }

  private visitExprError(expr: AstExprError): void {
    for (const e of expr.expressions) this.visitExpr(e, ValueContext.RValue);
  }

  private flattenPack(pack: TypePackId): TypeId {
    pack = followPack(pack);

    const fst = first(pack, false);
    if (fst) return fst;

    const ftp = getPack(pack, "FreeTypePack");
    if (ftp) {
      const result = this.module.internalTypes.freshType(this.builtinTypes, ftp.scope);
      const freeTail = this.module.internalTypes.addTypePack(freeTypePack(ftp.scope));

      emplaceTypePack(pack, typePack([result], freeTail));

      return result;
    } else if (getPack(pack, "ErrorTypePack")) return this.builtinTypes.errorType;
    else if (finite(pack) && packSize(pack) === 0) return this.builtinTypes.nilType;
    else {
      this.reportError({ kind: "InternalError", message: "flattenPack got a weird pack!" }, new Location());
      return this.builtinTypes.errorType;
    }
  }

  private visitTypeArguments(typeArguments: AstTypeOrPack[]): void {
    for (const typeArgument of typeArguments) {
      if (typeArgument.type) this.visitType(typeArgument.type);
      else this.visitTypePack(typeArgument.typePack!);
    }
  }

  private visitGenerics(generics: AstGenericType[], genericPacks: AstGenericTypePack[]): void {
    const seen = new Set<string>();

    for (const g of generics) {
      if (seen.has(g.name)) this.reportError({ kind: "DuplicateGenericParameter", parameterName: g.name }, g.location);
      else seen.add(g.name);

      if (g.defaultValue) this.visitType(g.defaultValue);
    }

    for (const g of genericPacks) {
      if (seen.has(g.name)) this.reportError({ kind: "DuplicateGenericParameter", parameterName: g.name }, g.location);
      else seen.add(g.name);

      if (g.defaultValue) this.visitTypePack(g.defaultValue);
    }
  }

  private visitType(ty: AstType): void {
    const resolvedTy = this.module.astResolvedTypes.get(ty);
    if (resolvedTy) this.checkForTypeFunctionInhabitance(follow(resolvedTy), ty.location, true);

    if (ty instanceof AstTypeReference) return this.visitTypeReference(ty);
    else if (ty instanceof AstTypeTable) return this.visitTypeTable(ty);
    else if (ty instanceof AstTypeFunction) return this.visitTypeFunction(ty);
    else if (ty instanceof AstTypeTypeof) return this.visitTypeTypeof(ty);
    else if (ty instanceof AstTypeUnion) return this.visitTypeUnion(ty);
    else if (ty instanceof AstTypeIntersection) return this.visitTypeIntersection(ty);
    else if (ty instanceof AstTypeGroup) return this.visitType(ty.type);
  }

  private visitTypeReference(ty: AstTypeReference): void {
    if (this.limits.debugMagicTypes && ty.name === "_luau_force_constraint_solving_incomplete") return;
    for (const param of ty.parameters) {
      if (param.type) this.visitType(param.type);
      else this.visitTypePack(param.typePack!);
    }

    const scope = this.findInnermostScope(ty.location);

    const alias = ty.prefix !== undefined ? scope.lookupImportedType(ty.prefix, ty.name) : scope.lookupType(ty.name);

    if (alias !== undefined) {
      if (ty.prefix === undefined && this.module.astTypeReferenceLookupFailures.has(ty)) {
        return this.reportError({ kind: "UnknownSymbol", name: ty.name, context: UnknownSymbolContext.Type }, ty.location);
      }

      const typesRequired = alias.typeParams.length;
      const packsRequired = alias.typePackParams.length;

      let typesProvided = 0;
      let extraTypes = 0;
      let packsProvided = 0;

      for (const p of ty.parameters) {
        if (p.type) {
          if (packsProvided !== 0) {
            this.reportError({ kind: "GenericError", message: "Type parameters must come before type pack parameters" }, ty.location);
            continue;
          }

          if (typesProvided < typesRequired) {
            typesProvided += 1;
          } else {
            extraTypes += 1;
          }
        } else if (p.typePack) {
          const tp = this.lookupPackAnnotation(p.typePack);
          if (tp === undefined) continue;

          if (typesProvided < typesRequired && packSize(tp) === 1 && finite(tp) && first(tp)) {
            typesProvided += 1;
          } else {
            packsProvided += 1;
          }
        }
      }

      if (typesRequired !== 0 && typesProvided === 0 && packsProvided !== 0) {
        this.reportError({ kind: "GenericError", message: "Type parameters must come before type pack parameters" }, ty.location);
      }

      if (extraTypes !== 0 && packsProvided === 0) {
        if (packsRequired !== 0) packsProvided += 1;
        else typesProvided += extraTypes;
      }

      for (let i = typesProvided; i < typesRequired; ++i) {
        if (alias.typeParams[i]!.defaultValue) {
          typesProvided += 1;
        }
      }

      for (let i = packsProvided; i < packsRequired; ++i) {
        if (alias.typePackParams[i]!.defaultValue) {
          packsProvided += 1;
        }
      }

      if (extraTypes === 0 && packsProvided + 1 === packsRequired && ty.hasParameterList) packsProvided += 1;

      if (typesProvided !== typesRequired || packsProvided !== packsRequired) {
        this.reportError(
          {
            kind: "IncorrectGenericParameterCount",
            name: ty.name,
            typeFun: alias,
            actualParameters: typesProvided,
            actualPackParameters: packsProvided,
          },
          ty.location,
        );
      }
    } else {
      if (scope.lookupPack(ty.name)) {
        this.reportError({ kind: "SwappedGenericTypeParameter", name: ty.name, genericKind: "Type" }, ty.location);
      } else {
        let symbol = "";
        if (ty.prefix !== undefined) {
          symbol += ty.prefix;
          symbol += ".";
        }
        symbol += ty.name;

        this.reportError({ kind: "UnknownSymbol", name: symbol, context: UnknownSymbolContext.Type }, ty.location);
      }
    }
  }

  private visitTypeTable(table: AstTypeTable): void {
    for (const prop of table.props) this.visitType(prop.type);

    if (table.indexer) {
      this.visitType(table.indexer.indexType);
      this.visitType(table.indexer.resultType);
    }
  }

  private visitTypeFunction(ty: AstTypeFunction): void {
    this.visitGenerics(ty.generics, ty.genericPacks);
    this.visitTypeList(ty.argTypes);
    this.visitTypePack(ty.returnTypes);
  }

  private visitTypeTypeof(ty: AstTypeTypeof): void {
    this.visitExpr(ty.expr, ValueContext.RValue);
  }

  private visitTypeUnion(ty: AstTypeUnion): void {
    for (const type of ty.types) this.visitType(type);
  }

  private visitTypeIntersection(ty: AstTypeIntersection): void {
    for (const type of ty.types) this.visitType(type);
  }

  private visitTypePack(pack: AstTypePack): void {
    if (pack instanceof AstTypePackExplicit) return this.visitTypePackExplicit(pack);
    else if (pack instanceof AstTypePackVariadic) return this.visitTypePackVariadic(pack);
    else if (pack instanceof AstTypePackGeneric) return this.visitTypePackGeneric(pack);
  }

  private visitTypePackExplicit(tp: AstTypePackExplicit): void {
    for (const type of tp.typeList.types) this.visitType(type);

    if (tp.typeList.tailType) this.visitTypePack(tp.typeList.tailType);
  }

  private visitTypePackVariadic(tp: AstTypePackVariadic): void {
    this.visitType(tp.variadicType);
  }

  private visitTypePackGeneric(tp: AstTypePackGeneric): void {
    const scope = this.findInnermostScope(tp.location);

    const alias = scope.lookupPack(tp.genericName);
    if (alias) {
      if (this.module.astTypePackReferenceLookupFailures.has(tp)) {
        return this.reportError({ kind: "UnknownSymbol", name: tp.genericName, context: UnknownSymbolContext.Type }, tp.location);
      }

      return;
    }

    if (scope.lookupType(tp.genericName)) {
      return this.reportError({ kind: "SwappedGenericTypeParameter", name: tp.genericName, genericKind: "Pack" }, tp.location);
    }

    this.reportError({ kind: "UnknownSymbol", name: tp.genericName, context: UnknownSymbolContext.Type }, tp.location);
  }

  private explainReasoningsImpl(subTy: TypeOrPack, superTy: TypeOrPack, location: Location, r: SubtypingResult): Reasonings {
    if (r.reasoning.empty()) return new Reasonings();

    const reasons: string[] = [];
    const seenReasons = new Set<string>();
    let suppressed = true;
    for (const reasoning of r.reasoning) {
      if (reasoning.subPath.empty() && reasoning.superPath.empty()) continue;

      const subMetadata: TypePathRenderMetadata = { returnTypePacks: new Map() };
      const superMetadata: TypePathRenderMetadata = { returnTypePacks: new Map() };

      const optSubLeaf = traverse(subTy, reasoning.subPath, this.builtinTypes, this.subtyping.arena, subMetadata);
      const optSuperLeaf = traverse(superTy, reasoning.superPath, this.builtinTypes, this.subtyping.arena, superMetadata);

      if (!optSubLeaf || !optSuperLeaf) {
        this.reportError({ kind: "InternalError", message: "Subtyping test returned a reasoning with an invalid path" }, location);
        return new Reasonings();
      }

      const subLeaf = optSubLeaf;
      const superLeaf = optSuperLeaf;

      const subLeafTy = isTypeId(subLeaf) ? subLeaf : undefined;
      const superLeafTy = isTypeId(superLeaf) ? superLeaf : undefined;

      const subLeafTp = isTypeId(subLeaf) ? undefined : subLeaf;
      const superLeafTp = isTypeId(superLeaf) ? undefined : superLeaf;

      if (!subLeafTy && !superLeafTy && !subLeafTp && !superLeafTp) {
        this.reportError(
          { kind: "InternalError", message: "Subtyping test returned a reasoning where one path ends at a type and the other ends at a pack." },
          location,
        );
        return new Reasonings();
      }

      let relation = "a subtype of";
      if (reasoning.variance === SubtypingVariance.Invariant) relation = "exactly";
      else if (reasoning.variance === SubtypingVariance.Contravariant) relation = "a supertype of";

      let subLeafAsString = toStringTypeOrPack(subLeaf);
      if (subLeafAsString === "") subLeafAsString = "()";

      let superLeafAsString = toStringTypeOrPack(superLeaf);
      if (superLeafAsString === "") superLeafAsString = "()";

      const baseReason = "`" + subLeafAsString + "` is not " + relation + " `" + superLeafAsString + "`";

      let reason = "";

      if (reasoning.isPropertyModifierViolation) {
        let propName = "a property";
        let isReadOnly = true;
        let renderedIndexerMismatch = false;
        const last = reasoning.subPath.last();

        const typeField = last && last.kind === "TypeField" ? last.field : undefined;

        if (typeField !== undefined && typeField === TypeField.IndexResult) {
          reason += "the indexer is read-only in the latter type, but the former type requires a read-write indexer";
          renderedIndexerMismatch = true;
        }

        if (!renderedIndexerMismatch) {
          if (last) {
            if (last.kind === "Property") {
              propName = "`" + last.name + "`";
              isReadOnly = last.isRead;
            }
          }

          if (isReadOnly) reason += propName + " is a read-only property in the latter type, but the former type requires a read-write property";
          else reason += propName + " is a write-only property in the latter type, but the former type requires a read-write property";
        }
      } else {
        const subPath = renderTypePath(reasoning.subPath, subMetadata);
        const superPath = renderTypePath(reasoning.superPath, superMetadata);

        let expectedReturnPack: string | undefined;
        let actualReturnPack: string | undefined;
        if (
          reasoning.variance === SubtypingVariance.Covariant &&
          reasoning.subPath.equals(reasoning.superPath) &&
          subPath.subject !== superPath.subject
        ) {
          for (const [index, subReturnTypePack] of subMetadata.returnTypePacks) {
            if (!subReturnTypePack.isSingular || !isTopLevelReturnIndex(reasoning.subPath, index)) continue;

            const superReturnTypePack = superMetadata.returnTypePacks.get(index);
            if (superReturnTypePack && superReturnTypePack.isSingular) continue;

            if (superReturnTypePack) {
              expectedReturnPack = "(" + toStringPack(superReturnTypePack.typePack) + ")";
              actualReturnPack = toStringPack(subReturnTypePack.typePack);
            }

            break;
          }
        }

        if (superPath.enclosingNegation && !subPath.enclosingNegation) {
          reason += "`" + subLeafAsString + "` cannot be `" + toString(superPath.enclosingNegation) + "`";
        } else if (subPath.enclosingNegation && !superPath.enclosingNegation) {
          reason += "`" + toString(subPath.enclosingNegation) + "` cannot be `" + superLeafAsString + "`";
        } else if (subPath.prefix === "" && superPath.prefix === "") {
          reason += baseReason;
        } else if (expectedReturnPack !== undefined && actualReturnPack !== undefined) {
          reason += "Expected to return `" + expectedReturnPack + "`, but got `" + actualReturnPack + "`";
        } else if (subPath.subject !== "" && subPath.subject === superPath.subject) {
          reason += "Expected " + subPath.subject + " to be ";
          if (reasoning.variance === SubtypingVariance.Invariant) reason += "exactly ";
          else if (reasoning.variance === SubtypingVariance.Contravariant) reason += "a supertype of ";
          reason += "`" + superLeafAsString + "`, but got `" + subLeafAsString + "`";
        } else if (reasoning.subPath.equals(reasoning.superPath) && subPath.subject !== "" && superPath.subject !== "") {
          reason += "Expected " + superPath.subject + " to be ";
          if (reasoning.variance === SubtypingVariance.Invariant) reason += "exactly ";
          else if (reasoning.variance === SubtypingVariance.Contravariant) reason += "a supertype of ";
          reason += "`" + superLeafAsString + "`, but " + subPath.prefix + "`" + subLeafAsString + "`";
        } else if (reasoning.subPath.equals(reasoning.superPath) && subPath.prefix === superPath.prefix) {
          reason +=
            subPath.prefix + "`" + subLeafAsString + "` in the latter type and `" + superLeafAsString + "` in the former type, and " + baseReason;
        } else if (subPath.prefix !== "" && superPath.prefix !== "") {
          reason += subPath.prefix + "`" + subLeafAsString + "` and " + superPath.prefix + "`" + superLeafAsString + "`, and " + baseReason;
        } else if (subPath.prefix !== "") {
          reason += subPath.prefix + "`" + subLeafAsString + "`, which is not " + relation + " `" + superLeafAsString + "`";
        } else {
          reason += superPath.prefix + "`" + superLeafAsString + "`, and " + baseReason;
        }
      }

      if (!seenReasons.has(reason)) {
        seenReasons.add(reason);
        reasons.push(reason);
      }

      if (suppressed) {
        if (subLeafTy && superLeafTy) {
          suppressed = this.isErrorSuppressing(location, subLeafTy) || this.isErrorSuppressing(location, superLeafTy);
        } else {
          suppressed = this.isErrorSuppressingPack(location, subLeafTp!) || this.isErrorSuppressingPack(location, superLeafTp!);
        }
      }
    }

    return new Reasonings(reasons, suppressed);
  }

  explainReasonings(subTy: TypeId, superTy: TypeId, location: Location, r: SubtypingResult): Reasonings {
    return this.explainReasoningsImpl(subTy, superTy, location, r);
  }

  explainReasoningsPack(subTp: TypePackId, superTp: TypePackId, location: Location, r: SubtypingResult): Reasonings {
    return this.explainReasoningsImpl(subTp, superTp, location, r);
  }

  private explainError(subTy: TypeId, superTy: TypeId, location: Location, result: SubtypingResult): void {
    if (result.isErrorSuppressing) return;

    switch (orElse(shouldSuppressErrors(this.normalizer, subTy), shouldSuppressErrors(this.normalizer, superTy))) {
      case ErrorSuppression.Suppress:
        return;
      case ErrorSuppression.NormalizationFailed:
        this.reportError({ kind: "NormalizationTooComplex" }, location);
        break;
      case ErrorSuppression.DoNotSuppress:
        break;
    }

    const reasonings = this.explainReasonings(subTy, superTy, location, result);

    if (!reasonings.suppressed) this.reportError(typeMismatch(superTy, subTy, { reason: reasonings.toString() }), location);
  }

  private explainErrorPack(subTy: TypePackId, superTy: TypePackId, location: Location, result: SubtypingResult): void {
    if (result.isErrorSuppressing) return;

    switch (orElse(shouldSuppressErrorsPack(this.normalizer, subTy), shouldSuppressErrorsPack(this.normalizer, superTy))) {
      case ErrorSuppression.Suppress:
        return;
      case ErrorSuppression.NormalizationFailed:
        this.reportError({ kind: "NormalizationTooComplex" }, location);
        break;
      case ErrorSuppression.DoNotSuppress:
        break;
    }

    const reasonings = this.explainReasoningsPack(subTy, superTy, location, result);

    if (!reasonings.suppressed) {
      this.reportError({ kind: "TypePackMismatch", wantedTp: superTy, givenTp: subTy, reason: reasonings.toString() }, location);
    }
  }

  private testLiteralOrAstTypeIsSubtype(expr: AstExpr, expectedType: TypeId): boolean {
    const scope = this.findInnermostScope(expr.location);
    const exprTy = this.lookupType(expr);

    const r = this.subtyping.isSubtype(exprTy, expectedType, scope);

    if (r.isSubtype) return true;

    return this.testPotentialLiteralIsSubtype(expr, expectedType);
  }

  private testSetMetatableCallIsSubtype(expr: AstExpr, expectedType: TypeId): boolean | undefined {
    const call = expr instanceof AstExprCall ? expr : undefined;
    if (!call || !matchSetMetatable(call)) return undefined;

    const expectedMetatable = get(follow(expectedType), "MetatableType");
    if (!expectedMetatable) return undefined;

    let passes = this.testLiteralOrAstTypeIsSubtype(call.args[0]!, expectedMetatable.table);
    if (!this.testLiteralOrAstTypeIsSubtype(call.args[1]!, expectedMetatable.metatable)) passes = false;
    return passes;
  }

  private testPotentialLiteralIsSubtype(expr: AstExpr, expectedType: TypeId): boolean {
    const exprType = follow(this.lookupType(expr));
    expectedType = follow(expectedType);

    const result = this.testSetMetatableCallIsSubtype(expr, expectedType);
    if (result !== undefined) return result;

    if (expr instanceof AstExprGroup) {
      return this.testPotentialLiteralIsSubtype(expr.expr, expectedType);
    } else if (expr instanceof AstExprIfElse) {
      let passes = this.testPotentialLiteralIsSubtype(expr.trueExpr, expectedType);
      if (!this.testPotentialLiteralIsSubtype(expr.falseExpr, expectedType)) passes = false;
      return passes;
    } else if (expr instanceof AstExprBinary && expr.op === BinaryOp.Or) {
      const relaxedExpectedLhs = this.module.internalTypes.addType(unionType([this.builtinTypes.falsyType, expectedType]));
      let passes = this.testPotentialLiteralIsSubtype(expr.left, relaxedExpectedLhs);
      if (!this.testPotentialLiteralIsSubtype(expr.right, expectedType)) passes = false;
      return passes;
    }

    const exprTable = expr instanceof AstExprTable ? expr : undefined;
    const exprTableType = get(exprType, "TableType");
    const expectedTableType = get(expectedType, "TableType");

    if (!exprTableType || !exprTable) return this.testIsSubtype(exprType, expectedType, expr.location);

    if (!expectedTableType) {
      const utv = get(expectedType, "UnionType");
      if (utv) {
        const tt = extractMatchingTableType(utv, exprType, this.builtinTypes, this.module.internalTypes);
        if (tt) return this.testLiteralOrAstTypeIsSubtype(expr, tt);
      }

      const itv = get(expectedType, "IntersectionType");
      if (itv) {
        const parts = new TypeIds(flatOptions(itv));
        const simplified = simplifyIntersection(this.builtinTypes, this.module.internalTypes, parts).result;
        if (is(simplified, "TableType")) return this.testPotentialLiteralIsSubtype(expr, simplified);
      }

      return this.testIsSubtype(exprType, expectedType, expr.location);
    }

    const missingKeys = new Set<string>();
    for (const [name, prop] of expectedTableType.props) {
      if (prop.readTy) {
        if (!isOptional(prop.readTy)) missingKeys.add(name);
      }
    }

    let isArrayLike = false;
    if (expectedTableType.indexer) {
      const scope = this.findInnermostScope(expr.location);

      const result = this.subtyping.isSubtype(this.builtinTypes.numberType, expectedTableType.indexer.indexType, scope);
      isArrayLike = result.isSubtype || this.isErrorSuppressing(expr.location, expectedTableType.indexer.indexType);
    }

    let isSubtype = true;

    for (const item of exprTable.items) {
      if (isRecord(item)) {
        const keyStr = (item.key as AstExprConstantString).value;

        missingKeys.delete(keyStr);
        const expectedProp = expectedTableType.props.get(keyStr);
        if (expectedProp === undefined) {
          if (expectedTableType.indexer) {
            this.module.astExpectedTypes.set(item.key!, expectedTableType.indexer.indexType);
            this.module.astExpectedTypes.set(item.value, expectedTableType.indexer.indexResultType);
            const inferredKeyType = this.module.internalTypes.addType(stringSingleton(keyStr));
            if (!this.testIsSubtype(inferredKeyType, expectedTableType.indexer.indexType, item.key!.location)) isSubtype = false;
            if (!this.testPotentialLiteralIsSubtype(item.value, expectedTableType.indexer.indexResultType)) isSubtype = false;
          }
        } else {
          if (expectedProp.readTy) {
            this.module.astExpectedTypes.set(item.value, expectedProp.readTy);
            if (!this.testPotentialLiteralIsSubtype(item.value, expectedProp.readTy)) isSubtype = false;
          }
        }
      } else if (item.kind === TableItemKind.List) {
        if (!isArrayLike) {
          isSubtype = false;
          this.reportError({ kind: "UnexpectedArrayLikeTableItem" }, item.value.location);
        }
        if (expectedTableType.indexer) {
          this.module.astExpectedTypes.set(item.value, expectedTableType.indexer.indexResultType);
          if (!this.testPotentialLiteralIsSubtype(item.value, expectedTableType.indexer.indexResultType)) isSubtype = false;
        }
      } else if (item.kind === TableItemKind.General && expectedTableType.indexer) {
        this.module.astExpectedTypes.set(item.key!, expectedTableType.indexer.indexType);
        this.module.astExpectedTypes.set(item.value, expectedTableType.indexer.indexResultType);
        if (!this.testPotentialLiteralIsSubtype(item.key!, expectedTableType.indexer.indexType)) isSubtype = false;
        if (!this.testPotentialLiteralIsSubtype(item.value, expectedTableType.indexer.indexResultType)) isSubtype = false;
      }
    }

    if (missingKeys.size > 0) {
      const temp: string[] = [];
      for (const key of missingKeys) temp.push(key);
      this.reportError(
        { kind: "MissingProperties", superType: expectedType, subType: exprType, properties: temp, context: MissingPropertiesContext.Missing },
        expr.location,
      );
      return false;
    }

    return isSubtype;
  }

  testIsSubtype(subTy: TypeId, superTy: TypeId, location: Location): boolean {
    const scope = this.findInnermostScope(location);
    const r = this.subtyping.isSubtype(subTy, superTy, scope);

    if (r.isErrorSuppressing) return r.isSubtype;

    this.reportErrors(atLocation(r.errors, location));
    if (r.normalizationTooComplex) this.reportError({ kind: "NormalizationTooComplex" }, location);

    if (!r.isSubtype) this.explainError(subTy, superTy, location, r);

    return r.isSubtype;
  }

  testIsSubtypePack(subTy: TypePackId, superTy: TypePackId, location: Location): boolean {
    const scope = this.findInnermostScope(location);
    const r = this.subtyping.isSubtypePack(subTy, superTy, scope, []);

    const errors = !this.isErrorSuppressingPack(location, subTy) ? atLocation(r.errors, location) : r.errors;
    this.reportErrors(errors);
    if (r.normalizationTooComplex) this.reportError({ kind: "NormalizationTooComplex" }, location);

    if (!r.isSubtype) this.explainErrorPack(subTy, superTy, location, r);

    return r.isSubtype;
  }

  protected maybeReportSubtypingError(subTy: TypeId, superTy: TypeId, location: Location): void {
    switch (orElse(shouldSuppressErrors(this.normalizer, subTy), shouldSuppressErrors(this.normalizer, superTy))) {
      case ErrorSuppression.Suppress:
        return;
      case ErrorSuppression.NormalizationFailed:
        this.reportError({ kind: "NormalizationTooComplex" }, location);
        break;
      case ErrorSuppression.DoNotSuppress:
        break;
      default:
        break;
    }

    this.reportError(typeMismatch(superTy, subTy), location);
  }

  private testIsSubtypeForInStat(iterFunc: TypeId, prospectiveFunc: TypeId, forInStat: AstStatForIn): void {
    const iterFuncLocation = forInStat.values[0]!.location;

    const scope = this.findInnermostScope(iterFuncLocation);
    const r = this.subtyping.isSubtype(iterFunc, prospectiveFunc, scope);

    const errors = !this.isErrorSuppressing(iterFuncLocation, iterFunc) ? atLocation(r.errors, iterFuncLocation) : r.errors;
    this.reportErrors(errors);

    if (r.normalizationTooComplex) this.reportError({ kind: "NormalizationTooComplex" }, iterFuncLocation);

    if (r.isSubtype) return;

    this.explainError(iterFunc, prospectiveFunc, iterFuncLocation, r);
  }

  reportError(data: TypeErrorData, location: Location): void {
    if (data.kind === "UnknownProperty") data = this.diagnoseMissingTableKey(data);

    this.module.errors.push(new LuauTypeError(location, data, this.module.name));
  }

  private reportTypeError(e: LuauTypeError): void {
    this.reportError(e.data, e.location);
  }

  private reportErrors(errors: LuauTypeError[]): void {
    for (const e of errors) this.reportTypeError(e);
  }

  private lookupProp(
    norm: NormalizedType,
    prop: string,
    context: ValueContext,
    location: Location,
    astIndexExprType: TypeId,
    errors: LuauTypeError[],
  ): PropertyTypes {
    const typesOfProp: TypeId[] = [];
    const typesMissingTheProp: TypeId[] = [];

    let normValid = true;

    const fetch = (ty: TypeId): void => {
      const result = this.normalizer.isInhabited(ty);
      if (result === NormalizationResult.HitLimits) normValid = false;
      if (result !== NormalizationResult.True) return;

      const seen = new Set<TypeId>();
      const res = this.hasIndexTypeFromType(ty, prop, context, location, seen, astIndexExprType, errors);

      if (res.present === NormalizationResult.HitLimits) {
        normValid = false;
        return;
      }

      if (res.present === NormalizationResult.True && res.result) typesOfProp.push(res.result);

      if (res.present === NormalizationResult.False) typesMissingTheProp.push(ty);
    };

    if (normValid) fetch(norm.tops);
    if (normValid) fetch(norm.booleans);

    if (normValid) {
      const localTypesOfProp: TypeId[] = [];

      for (const [ty] of norm.externTypes.externTypes) {
        const result = this.normalizer.isInhabited(ty);
        if (result === NormalizationResult.HitLimits) normValid = false;
        if (result !== NormalizationResult.True) continue;

        const seen = new Set<TypeId>();
        const res = this.hasIndexTypeFromType(ty, prop, context, location, seen, astIndexExprType, errors);

        if (res.present === NormalizationResult.HitLimits) {
          normValid = false;
          continue;
        }

        if (res.present === NormalizationResult.True && res.result) localTypesOfProp.push(res.result);
      }

      for (const ty of norm.externTypes.shapeExtensions) {
        const result = this.normalizer.isInhabited(ty);
        if (result === NormalizationResult.HitLimits) normValid = false;
        if (result !== NormalizationResult.True) continue;

        const seen = new Set<TypeId>();
        const res = this.hasIndexTypeFromType(ty, prop, context, location, seen, astIndexExprType, errors);

        if (res.present === NormalizationResult.HitLimits) {
          normValid = false;
          continue;
        }

        if (res.present === NormalizationResult.True && res.result) localTypesOfProp.push(res.result);
      }

      if (localTypesOfProp.length > 0) typesOfProp.push(...localTypesOfProp);
      else {
        typesMissingTheProp.push(...norm.externTypes.ordering);
        typesMissingTheProp.push(...norm.externTypes.shapeExtensions);
      }
    } else if (normValid) {
      for (const [ty] of norm.externTypes.externTypes) {
        fetch(ty);

        if (!normValid) break;
      }
    }

    if (normValid) fetch(norm.errors);
    if (normValid) fetch(norm.nils);
    if (normValid) fetch(norm.numbers);
    if (normValid && !norm.strings.isNever()) fetch(this.builtinTypes.stringType);
    if (normValid) fetch(norm.threads);
    if (normValid) fetch(norm.buffers);

    if (normValid) {
      for (const ty of norm.tables) {
        fetch(ty);

        if (!normValid) break;
      }
    }

    if (normValid && norm.functions.isTop) fetch(this.builtinTypes.functionType);
    else if (normValid && !norm.functions.isNever()) {
      if (norm.functions.parts.size === 1) fetch(norm.functions.parts.front());
      else {
        const parts: TypeId[] = [...norm.functions.parts];
        fetch(this.module.internalTypes.addType(intersectionType(parts)));
      }
    }

    if (normValid) {
      for (const [tyvar, intersect] of norm.tyvars) {
        if (get(intersect.tops, "NeverType")) {
          const ty = this.normalizer.typeFromNormal(intersect);
          fetch(this.module.internalTypes.addType(intersectionType([tyvar, ty])));
        } else fetch(follow(tyvar));

        if (!normValid) break;
      }
    }

    return new PropertyTypes(typesOfProp, typesMissingTheProp);
  }

  private checkIndexTypeFromType(tableTy: TypeId, prop: string, context: ValueContext, location: Location, astIndexExprType: TypeId): void {
    const norm = this.normalizer.normalize(tableTy);
    if (!norm) {
      this.reportError({ kind: "NormalizationTooComplex" }, location);
      return;
    }

    if (norm.shouldSuppressErrors()) return;

    const dummy: LuauTypeError[] = [];
    const propTypes = this.lookupProp(norm, prop, context, location, astIndexExprType, this.module.errors);

    if (propTypes.foundMissingProp()) {
      if (propTypes.foundOneProp()) {
        this.reportError({ kind: "MissingUnionProperty", type: tableTy, missing: propTypes.missingProp, key: prop }, location);
      }
      else if (context === ValueContext.LValue) {
        const lvPropTypes = this.lookupProp(norm, prop, ValueContext.RValue, location, astIndexExprType, dummy);
        if (lvPropTypes.foundOneProp() && lvPropTypes.noneMissingProp()) {
          this.reportError(
            { kind: "PropertyAccessViolation", table: tableTy, key: prop, context: PropertyAccessViolationContext.CannotWrite },
            location,
          );
        } else if (get(tableTy, "PrimitiveType") || get(tableTy, "FunctionType")) {
          this.reportError({ kind: "NotATable", ty: tableTy }, location);
        } else {
          const et = get(tableTy, "ExternType");
          if (et) {
            if (et.indexer) this.reportError({ kind: "UnknownProperty", table: tableTy, key: prop }, location);
            else {
              this.reportError(
                { kind: "PropertyAccessViolation", table: tableTy, key: prop, context: PropertyAccessViolationContext.CannotWrite },
                location,
              );
            }
          } else {
            this.reportError({ kind: "CannotExtendTable", tableType: tableTy, context: CannotExtendTableContext.Property, prop }, location);
          }
        }
      } else if (context === ValueContext.RValue) {
        const rvPropTypes = this.lookupProp(norm, prop, ValueContext.LValue, location, astIndexExprType, dummy);
        if (rvPropTypes.foundOneProp() && rvPropTypes.noneMissingProp()) {
          this.reportError(
            { kind: "PropertyAccessViolation", table: tableTy, key: prop, context: PropertyAccessViolationContext.CannotRead },
            location,
          );
        } else {
          this.reportError({ kind: "UnknownProperty", table: tableTy, key: prop }, location);
        }
      } else {
        this.reportError({ kind: "UnknownProperty", table: tableTy, key: prop }, location);
      }
    }
  }

  private hasIndexTypeFromType(
    ty: TypeId,
    prop: string,
    context: ValueContext,
    location: Location,
    seen: Set<TypeId>,
    astIndexExprType: TypeId,
    errors: LuauTypeError[],
  ): PropertyType {
    if (seen.has(ty)) return { present: NormalizationResult.True, result: undefined };
    seen.add(ty);

    if (get(ty, "ErrorType") || get(ty, "AnyType") || get(ty, "NeverType")) return { present: NormalizationResult.True, result: ty };

    if (isString(ty)) {
      const mtIndex = findMetatableEntry(this.builtinTypes, errors, this.builtinTypes.stringType, "__index", location);
      ty = mtIndex!;
    }

    const tt = getTableType(ty);
    if (tt) {
      const resTy = findTablePropertyRespectingMeta(this.builtinTypes, errors, ty, prop, context, location);
      if (resTy) return { present: NormalizationResult.True, result: resTy };

      if (tt.indexer) {
        const indexType = follow(tt.indexer.indexType);
        const givenType = this.module.internalTypes.addType(stringSingleton(prop));
        const keyMatches = this.subtyping.isSubtype(givenType, indexType, this.module.getModuleScope()).isSubtype;

        if (keyMatches) {
          if (context === ValueContext.LValue && tt.indexer.isReadOnly) return { present: NormalizationResult.False, result: undefined };
          return { present: NormalizationResult.True, result: tt.indexer.indexResultType };
        }
      }

      return { present: NormalizationResult.False, result: this.builtinTypes.unknownType };
    }

    const cls = get(ty, "ExternType");
    if (cls) {
      const property = lookupExternTypeProp(cls, prop);
      if (property) {
        if ((context === ValueContext.LValue && !property.writeTy) || (context === ValueContext.RValue && !property.readTy)) {
          return { present: NormalizationResult.False, result: undefined };
        } else {
          return { present: NormalizationResult.True, result: context === ValueContext.LValue ? property.writeTy : property.readTy };
        }
      }
      if (cls.indexer) {
        const inhabitedTestType = this.module.internalTypes.addType(intersectionType([cls.indexer.indexType, astIndexExprType]));
        return { present: this.normalizer.isInhabited(inhabitedTestType), result: cls.indexer.indexResultType };
      }

      return { present: NormalizationResult.False, result: undefined };
    }

    const utv = get(ty, "UnionType");
    if (utv) {
      const parts: TypeId[] = [];

      for (const part of flatOptions(utv)) {
        const result = this.hasIndexTypeFromType(part, prop, context, location, seen, astIndexExprType, errors);

        if (result.present !== NormalizationResult.True) return { present: result.present, result: undefined };
        if (result.result) parts.push(result.result);
      }

      if (parts.length === 0) return { present: NormalizationResult.False, result: undefined };

      if (parts.length === 1) return { present: NormalizationResult.True, result: parts[0] };

      let propTy: TypeId;
      if (context === ValueContext.LValue) propTy = this.module.internalTypes.addType(intersectionType(parts));
      else propTy = this.module.internalTypes.addType(unionType(parts));

      return { present: NormalizationResult.True, result: propTy };
    }

    const itv = get(ty, "IntersectionType");
    if (itv) {
      for (const part of flatOptions(itv)) {
        const result = this.hasIndexTypeFromType(part, prop, context, location, seen, astIndexExprType, errors);
        if (result.present !== NormalizationResult.False) return result;
      }

      return { present: NormalizationResult.False, result: undefined };
    }

    const pt = get(ty, "PrimitiveType");
    if (pt) {
      return {
        present: inConditional(this.typeContext) && pt.type === PrimitiveKind.Table ? NormalizationResult.True : NormalizationResult.False,
        result: ty,
      };
    }

    return { present: NormalizationResult.False, result: undefined };
  }

  private suggestAnnotations(expr: AstExprFunction, ty: TypeId): void {
    const inferredFtv = get(ty, "FunctionType")!;

    const workList: TypeId[] = [];
    const seen = new Set<TypeId>();

    const guesser = new TypeFunctionReductionGuesser(this.module.internalTypes, this.builtinTypes, this.normalizer);
    for (const retTy of flatten(inferredFtv.retTypes).head) workList.push(retTy);

    while (workList.length > 0) {
      const t = follow(workList.shift()!);

      if (seen.has(t)) continue;
      seen.add(t);

      const ut = get(t, "UnionType");
      const it = get(t, "IntersectionType");
      if (ut) {
        for (const option of flatOptions(ut)) workList.push(option);
      } else if (it) {
        for (const part of flatOptions(it)) workList.push(part);
      } else if (get(t, "TypeFunctionInstanceType")) {
        const result = guesser.guessTypeFunctionReductionForFunctionExpr(expr, inferredFtv, t);
        if (result.shouldRecommendAnnotation && !get(result.guessedReturnType, "UnknownType")) {
          this.reportError(
            {
              kind: "ExplicitFunctionAnnotationRecommended",
              recommendedArgs: result.guessedFunctionAnnotations,
              recommendedReturn: result.guessedReturnType!,
            },
            expr.location,
          );
        }
      }
    }
  }

  private checkTypeInstantiation(baseFunctionExpr: AstExpr, fnType: TypeId, location: Location, typeArguments: AstTypeOrPack[]): void {
    const ftv = get(follow(fnType), "FunctionType");
    if (!ftv) {
      let interestingEdgeCase: "None" | "MetatableCall" | "Intersection" = "None";

      if (findMetatableEntry(this.builtinTypes, this.module.errors, fnType, "__call", location) !== undefined) {
        interestingEdgeCase = "MetatableCall";
      } else if (get(follow(fnType), "IntersectionType")) {
        interestingEdgeCase = "Intersection";
      }

      this.reportError({ kind: "InstantiateGenericsOnNonFunction", interestingEdgeCase }, location);

      return;
    }

    let typeCount = 0;
    let typePackCount = 0;

    for (const typeOrPack of typeArguments) {
      if (typeOrPack.type) {
        ++typeCount;
      } else {
        ++typePackCount;
      }
    }

    if (ftv.generics.length < typeCount || ftv.genericPacks.length < typePackCount) {
      this.reportError(
        {
          kind: "TypeInstantiationCountMismatch",
          functionName: getIdentifierOfBaseVar(baseFunctionExpr),
          functionType: fnType,
          providedTypes: typeCount,
          maximumTypes: ftv.generics.length,
          providedTypePacks: typePackCount,
          maximumTypePacks: ftv.genericPacks.length,
        },
        location,
      );
    }
  }

  private diagnoseMissingTableKey(utk: UnknownPropertyData): TypeErrorData {
    const sv = utk.key;
    const candidates = new Set<string>();

    const accumulate = (props: Props): void => {
      for (const [name] of props) {
        if (sv !== name && equalsLower(sv, name)) candidates.add(name);
      }
    };

    const ttv = getTableType(utk.table);
    if (ttv) accumulate(ttv.props);
    else {
      let etv = get(follow(utk.table), "ExternType");
      while (etv) {
        accumulate(etv.props);

        if (!etv.parent) break;

        etv = get(etv.parent, "ExternType");
      }
    }

    if (candidates.size > 0) {
      return { kind: "UnknownPropButFoundLikeProp", table: utk.table, key: utk.key, candidates: [...candidates].sort(compareNames) };
    }
    return utk;
  }

  private isErrorSuppressing(loc: Location, ty: TypeId): boolean {
    switch (shouldSuppressErrors(this.normalizer, ty)) {
      case ErrorSuppression.DoNotSuppress:
        return false;
      case ErrorSuppression.Suppress:
        return true;
      case ErrorSuppression.NormalizationFailed:
        this.reportError({ kind: "NormalizationTooComplex" }, loc);
        return false;
    }
  }

  protected isErrorSuppressing2(loc1: Location, ty1: TypeId, loc2: Location, ty2: TypeId): boolean {
    return this.isErrorSuppressing(loc1, ty1) || this.isErrorSuppressing(loc2, ty2);
  }

  private isErrorSuppressingPack(loc: Location, tp: TypePackId): boolean {
    switch (shouldSuppressErrorsPack(this.normalizer, tp)) {
      case ErrorSuppression.DoNotSuppress:
        return false;
      case ErrorSuppression.Suppress:
        return true;
      case ErrorSuppression.NormalizationFailed:
        this.reportError({ kind: "NormalizationTooComplex" }, loc);
        return false;
    }
  }

  protected isErrorSuppressingPack2(loc1: Location, tp1: TypePackId, loc2: Location, tp2: TypePackId): boolean {
    return this.isErrorSuppressingPack(loc1, tp1) || this.isErrorSuppressingPack(loc2, tp2);
  }

  protected reportNonviableOverloadErrors(
    nonviableOverloads: [TypeId, LuauTypeError[]][],
    callFuncLocation: Location,
    argHeadSize: number,
    callLocation: Location,
  ): boolean {
    let reportedErrors: LuauTypeError[] | undefined;
    let multipleOverloadsHaveErrors = false;
    for (const [ty, errs] of nonviableOverloads) {
      if (!this.isErrorSuppressing(callFuncLocation, ty) && errs.length > 0) {
        if (reportedErrors) {
          multipleOverloadsHaveErrors = true;
          break;
        }
        reportedErrors = errs;
      }
    }
    if (multipleOverloadsHaveErrors) {
      this.reportError({ kind: "MultipleNonviableOverloads", attemptedArgCount: argHeadSize }, callLocation);
      return true;
    } else if (reportedErrors) {
      this.reportErrors(reportedErrors);
      return true;
    }

    return false;
  }
}

