// Constraints, ported from Luau's `Constraint.h`/`Constraint.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`). The constraint generator emits one
// of these for each relationship between types it finds in the program, and
// the solver dispatches them.

import type { AstAttr, AstExpr, AstExprCall, AstExprFunction, AstNode } from "./Ast";
import type { LuauTypeError } from "./Error";
import type { Location } from "./Location";
import type { Scope } from "./Scope";
import { get, TableState, type TypeId, type TypePackId, type TypePackVariant, type TypeVariant } from "./Type";
import { TypeOnceVisitor } from "./VisitType";

export const enum ValueContext {
  LValue,
  RValue,
}

export interface EqualityConstraint {
  readonly kind: "EqualityConstraint";
  resultType: TypeId;
  assignmentType: TypeId;
}

export interface SubtypeConstraint {
  readonly kind: "SubtypeConstraint";
  subType: TypeId;
  superType: TypeId;
}

export interface PackSubtypeConstraint {
  readonly kind: "PackSubtypeConstraint";
  subPack: TypePackId;
  superPack: TypePackId;
  /** Whether the constraint checks a `return` against the function's return pack. */
  returns: boolean;
}

export interface GeneralizationConstraint {
  readonly kind: "GeneralizationConstraint";
  generalizedType: TypeId;
  sourceType: TypeId;
  maybeDeprecatedAttr: AstAttr | undefined;
  noGenerics: boolean;
}

export interface IterableConstraint {
  readonly kind: "IterableConstraint";
  iterator: TypePackId;
  variables: TypeId[];
  nextAstFragment: AstNode | undefined;
  astForInNextTypes: Map<AstNode, TypeId> | undefined;
}

export interface NameConstraint {
  readonly kind: "NameConstraint";
  namedType: TypeId;
  name: string;
  synthetic: boolean;
  typeParameters: TypeId[];
  typePackParameters: TypePackId[];
}

export interface TypeAliasExpansionConstraint {
  readonly kind: "TypeAliasExpansionConstraint";
  target: TypeId;
}

export interface FunctionCallConstraint {
  readonly kind: "FunctionCallConstraint";
  fn: TypeId;
  argsPack: TypePackId;
  result: TypePackId;
  callSite: AstExprCall | undefined;
  discriminantTypes: (TypeId | undefined)[];
  typeArguments: TypeId[];
  typePackArguments: TypePackId[];
  astTypes: Map<AstExpr, TypeId> | undefined;
  astOverloadResolvedTypes: Map<AstNode, TypeId> | undefined;
}

export interface FunctionCheckConstraint {
  readonly kind: "FunctionCheckConstraint";
  fn: TypeId;
  argsPack: TypePackId;
  callSite: AstExprCall | undefined;
  astTypes: Map<AstExpr, TypeId>;
  astExpectedTypes: Map<AstExpr, TypeId>;
}

export interface HasPropConstraint {
  readonly kind: "HasPropConstraint";
  resultType: TypeId;
  subjectType: TypeId;
  prop: string;
  context: ValueContext;
  inConditional: boolean;
  suppressSimplification: boolean;
}

export interface HasIndexerConstraint {
  readonly kind: "HasIndexerConstraint";
  resultType: TypeId;
  subjectType: TypeId;
  indexType: TypeId;
}

export interface AssignPropConstraint {
  readonly kind: "AssignPropConstraint";
  lhsType: TypeId;
  propName: string;
  rhsType: TypeId;
  propLocation: Location | undefined;
  propType: TypeId;
  decrementPropCount: boolean;
}

export interface AssignIndexConstraint {
  readonly kind: "AssignIndexConstraint";
  lhsType: TypeId;
  indexType: TypeId;
  rhsType: TypeId;
  propType: TypeId;
}

export interface UnpackConstraint {
  readonly kind: "UnpackConstraint";
  resultPack: TypeId[];
  sourcePack: TypePackId;
}

export interface ReduceConstraint {
  readonly kind: "ReduceConstraint";
  ty: TypeId;
}

export interface ReducePackConstraint {
  readonly kind: "ReducePackConstraint";
  tp: TypePackId;
}

export interface SimplifyConstraint {
  readonly kind: "SimplifyConstraint";
  ty: TypeId;
}

export interface PushFunctionTypeConstraint {
  readonly kind: "PushFunctionTypeConstraint";
  expectedFunctionType: TypeId;
  functionType: TypeId;
  expr: AstExprFunction;
  isSelf: boolean;
}

export interface TypeInstantiationConstraint {
  readonly kind: "TypeInstantiationConstraint";
  functionType: TypeId;
  placeholderType: TypeId;
  typeArguments: TypeId[];
  typePackArguments: TypePackId[];
}

export interface PushTypeConstraint {
  readonly kind: "PushTypeConstraint";
  expectedType: TypeId;
  targetType: TypeId;
  astTypes: Map<AstExpr, TypeId>;
  astExpectedTypes: Map<AstExpr, TypeId>;
  expr: AstExpr;
}

export type ConstraintV =
  | SubtypeConstraint
  | PackSubtypeConstraint
  | GeneralizationConstraint
  | IterableConstraint
  | NameConstraint
  | TypeAliasExpansionConstraint
  | FunctionCallConstraint
  | FunctionCheckConstraint
  | HasPropConstraint
  | HasIndexerConstraint
  | AssignPropConstraint
  | AssignIndexConstraint
  | UnpackConstraint
  | ReduceConstraint
  | ReducePackConstraint
  | EqualityConstraint
  | SimplifyConstraint
  | PushFunctionTypeConstraint
  | PushTypeConstraint
  | TypeInstantiationConstraint;

export type ConstraintKind = ConstraintV["kind"];

/**
 * What constraint generation hands the solver (Luau's `ConstraintSet`). The
 * constraints themselves, the free types and the function of each signature
 * scope live in the `ConstraintGraph`.
 */
export interface ConstraintSet {
  rootScope: Scope;
  /** The rare errors constraint generation itself reports. */
  errors: LuauTypeError[];
  /** The module's generalization constraints, dispatched after every other constraint. */
  deferredConstraints: Constraint[];
}

let nextConstraintSerial = 0;

export class Constraint {
  readonly serial = ++nextConstraintSerial;

  constructor(
    readonly scope: Scope,
    readonly location: Location,
    public c: ConstraintV,
    readonly moduleName?: string,
  ) {}

  get<K extends ConstraintKind>(kind: K): Extract<ConstraintV, { kind: K }> | undefined {
    return this.c.kind === kind ? (this.c as Extract<ConstraintV, { kind: K }>) : undefined;
  }

  /**
   * The types this constraint may mutate the bounds of. Reduce and
   * generalization constraints only bind types, so they contribute none.
   */
  getMaybeMutatedTypes(): { types: TypeId[]; typePacks: TypePackId[] } {
    const rci = new ReferenceCountInitializer();
    const c = this.c;
    switch (c.kind) {
      case "EqualityConstraint":
        rci.traverse(c.resultType);
        rci.traverse(c.assignmentType);
        break;
      case "SubtypeConstraint":
        rci.traverse(c.subType);
        rci.traverse(c.superType);
        break;
      case "PackSubtypeConstraint":
        rci.traversePack(c.subPack);
        rci.traversePack(c.superPack);
        break;
      case "IterableConstraint":
        for (const ty of c.variables) rci.traverse(ty);
        rci.traversePack(c.iterator);
        break;
      case "NameConstraint":
        rci.traverse(c.namedType);
        break;
      case "TypeAliasExpansionConstraint":
        rci.traverse(c.target);
        break;
      case "FunctionCheckConstraint":
        rci.traversePack(c.argsPack);
        break;
      case "FunctionCallConstraint":
        rci.traverse(c.fn);
        rci.traversePack(c.argsPack);
        break;
      case "HasPropConstraint":
        rci.traverse(c.resultType);
        rci.traverse(c.subjectType);
        break;
      case "HasIndexerConstraint":
        rci.traverse(c.subjectType);
        rci.traverse(c.resultType);
        break;
      case "AssignPropConstraint":
        rci.traverse(c.lhsType);
        rci.traverse(c.rhsType);
        break;
      case "AssignIndexConstraint":
        rci.traverse(c.lhsType);
        rci.traverse(c.indexType);
        rci.traverse(c.rhsType);
        break;
      case "UnpackConstraint":
        for (const ty of c.resultPack) rci.traverse(ty);
        // The source pack is mutated through the result, as `new[key] = value`
        // mutates the table `table.clone` returned.
        rci.traversePack(c.sourcePack);
        break;
      case "ReducePackConstraint":
        rci.traversePack(c.tp);
        break;
      case "PushFunctionTypeConstraint":
        rci.traverse(c.functionType);
        break;
      case "PushTypeConstraint":
        rci.traverse(c.targetType);
        break;
      default:
        break;
    }
    return { types: [...rci.mutatedTypes], typePacks: [...rci.mutatedTypePacks] };
  }
}

/** Collects the types a constraint may mutate: free, blocked and pending types, and unsealed or free tables. */
export class ReferenceCountInitializer extends TypeOnceVisitor {
  readonly mutatedTypes = new Set<TypeId>();
  readonly mutatedTypePacks = new Set<TypePackId>();

  constructor() {
    super("ReferenceCountInitializer", true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    switch (v.kind) {
      case "FreeType":
      case "BlockedType":
      case "PendingExpansionType":
        this.mutatedTypes.add(ty);
        return false;
      case "TableType":
        if (v.state === TableState.Unsealed || v.state === TableState.Free) this.mutatedTypes.add(ty);
        return true;
      case "ExternType":
        return false;
      case "TypeFunctionInstanceType":
        return v.function.canReduceGenerics;
      default:
        return this.visit(ty);
    }
  }

  override visitTypePack(tp: TypePackId, v: TypePackVariant): boolean {
    if (v.kind === "BlockedTypePack" || v.kind === "FreeTypePack") {
      this.mutatedTypePacks.add(tp);
      return true;
    }
    return this.visitPack(tp);
  }
}

export function isReferenceCountedType(ty: TypeId): boolean {
  const tt = get(ty, "TableType");
  if (tt) return tt.state === TableState.Free || tt.state === TableState.Unsealed;
  return get(ty, "FreeType") !== undefined || get(ty, "BlockedType") !== undefined || get(ty, "PendingExpansionType") !== undefined;
}
