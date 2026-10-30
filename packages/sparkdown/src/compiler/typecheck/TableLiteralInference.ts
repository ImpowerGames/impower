// Bidirectional inference for literals, ported from Luau's
// `TableLiteralInference.h`/`TableLiteralInference.cpp`; Luau is
// MIT-licensed (see `LICENSE-luau.txt`).

import {
  AstExprCall,
  AstExprConstantBool,
  AstExprConstantNil,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprFunction,
  AstExprGroup,
  AstExprIfElse,
  AstExprTable,
  TableItemKind,
  type AstExpr,
} from "./Ast";
import { matchSetMetatable } from "./BuiltinDefinitions";
import type { Constraint } from "./Constraint";
import type { ConstraintSolver } from "./ConstraintSolver";
import { IterativeTypeVisitor } from "./IterativeTypeVisitor";
import { relate, Relation } from "./Simplify";
import type { Subtyping } from "./Subtyping";
import {
  flatOptions,
  flatten,
  follow,
  followPack,
  get,
  getPack,
  is,
  maybeSingleton,
  packSize,
  TypeFunctionInstanceState,
  type FunctionType,
  type TypeId,
  type TypeVariant,
} from "./Type";
import { containsGeneric, extendTypePack, extractMatchingTableType, isLiteral, isRecord } from "./TypeUtils";
import type { Unifier2 } from "./Unifier2";

export interface IncompleteInference {
  expectedType: TypeId;
  targetType: TypeId;
  expr: AstExpr;
}

export interface PushTypeResult {
  incompleteTypes: IncompleteInference[];
}

class FindFunctionTypeIn extends IterativeTypeVisitor {
  candidate: FunctionType | undefined;
  ambiguous = false;

  constructor(readonly numberOfLambdaParameters: number) {
    super("FindFunctionTypeIn", true, true);
  }

  override visit(_ty: TypeId): boolean {
    return false;
  }

  override visitType(ty: TypeId, variant: TypeVariant): boolean {
    switch (variant.kind) {
      case "UnionType":
        return true;
      case "IntersectionType":
        return true;
      case "FunctionType":
        return this.visitFunction(ty, variant);
      default:
        return this.visit(ty);
    }
  }

  private visitFunction(ty: TypeId, ftv: FunctionType): boolean {
    if (this.candidate === undefined) {
      this.candidate = get(ty, "FunctionType");
      this.ambiguous = false;
      return false;
    }

    const candidateDistance = Math.abs(packSize(this.candidate.argTypes) - this.numberOfLambdaParameters);
    const thisDistance = Math.abs(packSize(ftv.argTypes) - this.numberOfLambdaParameters);

    if (thisDistance < candidateDistance) {
      this.candidate = get(ty, "FunctionType");
      this.ambiguous = false;
    } else if (thisDistance === candidateDistance) {
      this.ambiguous = true;
    }
    return false;
  }
}

function isCheckableExpr(expr: AstExpr): boolean {
  if (expr instanceof AstExprCall && matchSetMetatable(expr)) return true;

  return isLiteral(expr) || expr instanceof AstExprGroup || expr instanceof AstExprIfElse;
}

class BidirectionalTypePusher {
  readonly incompleteInferences: IncompleteInference[] = [];

  private readonly seen = new Map<TypeId, Set<AstExpr>>();

  constructor(
    readonly astTypes: Map<AstExpr, TypeId>,
    readonly astExpectedTypes: Map<AstExpr, TypeId>,
    readonly solver: ConstraintSolver,
    readonly constraint: Constraint,
    readonly genericTypesAndPacks: Set<object>,
    readonly unifier: Unifier2,
    readonly subtyping: Subtyping,
  ) {}

  pushType(expectedType: TypeId, expr: AstExpr): TypeId {
    this.astExpectedTypes.set(expr, expectedType);
    if (!this.astTypes.has(expr)) return this.solver.builtinTypes.anyType;

    let exprType = this.astTypes.get(expr)!;

    let seenExprs = this.seen.get(expectedType);
    if (seenExprs?.has(expr)) return exprType;
    if (!seenExprs) {
      seenExprs = new Set();
      this.seen.set(expectedType, seenExprs);
    }
    seenExprs.add(expr);

    expectedType = follow(expectedType);
    exprType = follow(exprType);

    if (!isCheckableExpr(expr)) {
      return exprType;
    }

    const tfit = get(expectedType, "TypeFunctionInstanceType");
    if (tfit && tfit.state === TypeFunctionInstanceState.Unsolved) {
      this.incompleteInferences.push({ expectedType, targetType: exprType, expr });
      return exprType;
    }

    if (is(expectedType, "BlockedType", "PendingExpansionType")) {
      this.incompleteInferences.push({ expectedType, targetType: exprType, expr });
      return exprType;
    }

    if (is(expectedType, "AnyType", "UnknownType")) return exprType;

    if (expr instanceof AstExprGroup) {
      this.pushType(expectedType, expr.expr);
      return exprType;
    }

    if (expr instanceof AstExprIfElse) {
      this.pushType(expectedType, expr.trueExpr);
      this.pushType(expectedType, expr.falseExpr);
      return exprType;
    }

    if (expr instanceof AstExprCall && matchSetMetatable(expr)) {
      const expectedMetatable = get(expectedType, "MetatableType");
      if (expectedMetatable) {
        this.pushType(expectedMetatable.table, expr.args[0]!);
        this.pushType(expectedMetatable.metatable, expr.args[1]!);
      }

      return exprType;
    }

    if (
      expr instanceof AstExprConstantString ||
      expr instanceof AstExprConstantNumber ||
      expr instanceof AstExprConstantBool ||
      expr instanceof AstExprConstantNil
    ) {
      const ft = get(exprType, "FreeType");
      if (ft) {
        if (maybeSingleton(expectedType) && maybeSingleton(ft.lowerBound)) {
          this.solver.bind(this.constraint, exprType, ft.lowerBound);
          return exprType;
        }

        const upperBoundRelation = relate(ft.upperBound, expectedType);
        if (upperBoundRelation === Relation.Subset || upperBoundRelation === Relation.Coincident) {
          this.solver.bind(this.constraint, exprType, expectedType);
          return exprType;
        }

        const lowerBoundRelation = relate(ft.lowerBound, expectedType);
        if (lowerBoundRelation === Relation.Subset || lowerBoundRelation === Relation.Coincident) {
          this.solver.bind(this.constraint, exprType, expectedType);
          return exprType;
        }
      }
    }

    if (expr instanceof AstExprFunction) {
      const lambdaTy = get(exprType, "FunctionType");

      const ffti = new FindFunctionTypeIn(expr.args.length);
      ffti.run(expectedType);
      const expectedLambdaTy = ffti.candidate;

      if (lambdaTy && expectedLambdaTy) {
        const { head: lambdaArgTys } = flatten(lambdaTy.argTypes);
        const { head: expectedLambdaArgTys } = extendTypePack(this.solver.arena, this.solver.builtinTypes, expectedLambdaTy.argTypes, expr.args.length);

        const limit = Math.min(lambdaArgTys.length, expectedLambdaArgTys.length, expr.args.length);
        for (let argIndex = 0; argIndex < limit; argIndex++) {
          if (
            !expr.args[argIndex]!.annotation &&
            get(follow(lambdaArgTys[argIndex]!), "FreeType") &&
            !containsGeneric(expectedLambdaArgTys[argIndex]!, this.genericTypesAndPacks)
          ) {
            this.solver.bind(this.constraint, lambdaArgTys[argIndex]!, expectedLambdaArgTys[argIndex]!);
          }
        }

        if (
          !ffti.ambiguous &&
          !expr.returnAnnotation &&
          getPack(followPack(lambdaTy.retTypes), "FreeTypePack") &&
          !containsGeneric(expectedLambdaTy.retTypes, this.genericTypesAndPacks)
        ) {
          this.solver.bindPack(this.constraint, lambdaTy.retTypes, expectedLambdaTy.retTypes);
        }
      }
    }

    if (expr instanceof AstExprTable) {
      const expectedTableTy = get(expectedType, "TableType");

      if (!expectedTableTy) {
        const utv = get(expectedType, "UnionType");
        if (utv) {
          const tt = extractMatchingTableType(utv, exprType, this.solver.builtinTypes, this.solver.arena);
          if (tt) this.pushType(tt, expr);
        } else {
          const itv = get(expectedType, "IntersectionType");
          if (itv) {
            for (const part of flatOptions(itv)) this.pushType(part, expr);

            this.astExpectedTypes.set(expr, expectedType);
          }
        }

        return exprType;
      }

      for (const item of expr.items) {
        if (isRecord(item)) {
          const keyStr = (item.key as AstExprConstantString).value;
          const expectedProp = expectedTableTy.props.get(keyStr);

          if (!expectedProp) {
            if (expectedTableTy.indexer) this.pushType(expectedTableTy.indexer.indexResultType, item.value);

            continue;
          }

          if (expectedProp.readTy) this.pushType(expectedProp.readTy, item.value);
        } else if (item.kind === TableItemKind.List) {
          if (expectedTableTy.indexer) {
            this.unifier.unify(expectedTableTy.indexer.indexType, this.solver.builtinTypes.numberType);
            this.pushType(expectedTableTy.indexer.indexResultType, item.value);
          }
        } else if (item.kind === TableItemKind.General) {
          if (expectedTableTy.indexer) {
            this.pushType(expectedTableTy.indexer.indexType, item.key!);
            this.pushType(expectedTableTy.indexer.indexResultType, item.value);
          }
        }
      }
    }

    return exprType;
  }
}

export function pushTypeInto(
  astTypes: Map<AstExpr, TypeId>,
  astExpectedTypes: Map<AstExpr, TypeId>,
  solver: ConstraintSolver,
  constraint: Constraint,
  genericTypesAndPacks: Set<object>,
  unifier: Unifier2,
  subtyping: Subtyping,
  expectedType: TypeId,
  expr: AstExpr,
): PushTypeResult {
  const btp = new BidirectionalTypePusher(astTypes, astExpectedTypes, solver, constraint, genericTypesAndPacks, unifier, subtyping);
  btp.pushType(expectedType, expr);
  return { incompleteTypes: btp.incompleteInferences };
}
