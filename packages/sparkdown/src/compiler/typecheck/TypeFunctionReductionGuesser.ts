// Guessing what the type function instances in a function's return type
// reduce to, so that the checker can recommend annotations for the function,
// ported from Luau's `TypeFunctionReductionGuesser.h`/
// `TypeFunctionReductionGuesser.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).

import type { AstExprFunction } from "./Ast";
import type { NormalizedType, Normalizer } from "./Normalize";
import {
  flatten,
  follow,
  get,
  isNumber,
  typePack,
  type BuiltinTypes,
  type FunctionType,
  type TypeArena,
  type TypeFunctionInstanceType,
  type TypeId,
  type TypePackId,
  type TypePackVariant,
  type TypeVariant,
} from "./Type";
import { TypeOnceVisitor } from "./VisitType";

export interface TypeFunctionReductionGuessResult {
  guessedFunctionAnnotations: [string, TypeId][];
  guessedReturnType: TypeId | undefined;
  shouldRecommendAnnotation: boolean;
}

/** An inference for a type function: the guessed types of its arguments, then a type for its result. */
export interface TypeFunctionInferenceResult {
  operandInference: TypeId[];
  functionResultInference: TypeId;
}

class InstanceCollector2 extends TypeOnceVisitor {
  tys: TypeId[] = [];
  tps: TypePackId[] = [];
  cyclicInstance = new Set<TypeId>();
  instanceArguments = new Set<TypeId>();

  constructor() {
    super("InstanceCollector2", /* skipBoundTypes */ true);
  }

  override visitType(ty: TypeId, v: TypeVariant): boolean {
    if (v.kind === "TypeFunctionInstanceType") {
      // The traversal is depth-first in the absence of cycles, so pushing to the
      // front of the queue puts deeper instances first: for
      // add<add<add<number, number>, number>, number>, the innermost
      // add<number, number> is reduced first.
      this.tys.unshift(ty);
      for (const t of v.typeArguments) this.instanceArguments.add(follow(t));
      return true;
    }
    if (v.kind === "ExternType") return false;
    return super.visitType(ty, v);
  }

  override cycle(ty: TypeId): void {
    // A cyclic type function instance.
    const t = follow(ty);
    if (get(t, "TypeFunctionInstanceType")) this.cyclicInstance.add(t);
  }

  override visitTypePack(tp: TypePackId, v: TypePackVariant): boolean {
    if (v.kind === "TypeFunctionInstanceTypePack") {
      // Deeper instances go first, as for types.
      this.tps.unshift(tp);
      return true;
    }
    return super.visitTypePack(tp, v);
  }
}

export class TypeFunctionReductionGuesser {
  /** Our hypothesis about what each type function instance reduces to. */
  functionReducesTo = new Map<TypeId, TypeId>();
  /** Our constraints on the operands of type function instances. */
  substitutable = new Map<TypeId, TypeId>();
  /** The instances still to make progress on. */
  toInfer: TypeId[] = [];
  cyclicInstances = new Set<TypeId>();

  constructor(
    readonly arena: TypeArena,
    readonly builtins: BuiltinTypes,
    readonly normalizer: Normalizer,
  ) {}

  guess(typ: TypeId): TypeId | undefined {
    const guessedType = this.guessType(typ);

    if (guessedType === undefined) return undefined;

    const guess = follow(guessedType);
    if (get(guess, "TypeFunctionInstanceType")) return undefined;

    return guess;
  }

  guessPack(tp: TypePackId): TypePackId | undefined {
    const { head, tail } = flatten(tp);

    const guessedHead: TypeId[] = [];

    for (const typ of head) {
      const guessedType = this.guessType(typ);

      if (guessedType === undefined) return undefined;

      const guess = follow(guessedType);
      if (get(guess, "TypeFunctionInstanceType")) return undefined;

      guessedHead.push(guessedType);
    }

    return this.arena.addTypePack(typePack(guessedHead, tail));
  }

  guessTypeFunctionReductionForFunctionExpr(expr: AstExprFunction, ftv: FunctionType, retTy: TypeId): TypeFunctionReductionGuessResult {
    const collector = new InstanceCollector2();
    collector.traverse(retTy);
    this.toInfer = collector.tys;
    this.cyclicInstances = collector.cyclicInstance;

    if (this.isFunctionGenericsSaturated(ftv, collector.instanceArguments)) {
      return { guessedFunctionAnnotations: [], guessedReturnType: undefined, shouldRecommendAnnotation: false };
    }
    this.infer();

    const results: [string, TypeId][] = [];
    const args: TypeId[] = [];
    for (const t of flatten(ftv.argTypes).head) args.push(t);

    // Submit a guess for the argument types.
    for (let i = 0; i < expr.args.length; i++) {
      const local = expr.args[i]!;
      if (i >= args.length) continue;

      const argTy = args[i]!;
      const guessedType = this.guessType(argTy);
      if (guessedType === undefined) continue;
      const guess = follow(guessedType);
      if (get(guess, "TypeFunctionInstanceType")) continue;

      results.push([local.name, guess]);
    }

    // Submit a guess for the return type.
    let recommendedAnnotation: TypeId;
    const guessedReturnType = this.guessType(retTy);
    if (guessedReturnType === undefined) recommendedAnnotation = this.builtins.unknownType;
    else recommendedAnnotation = follow(guessedReturnType);
    if (get(recommendedAnnotation, "TypeFunctionInstanceType")) recommendedAnnotation = this.builtins.unknownType;

    this.toInfer = [];
    this.cyclicInstances.clear();
    this.functionReducesTo.clear();
    this.substitutable.clear();

    return { guessedFunctionAnnotations: results, guessedReturnType: recommendedAnnotation, shouldRecommendAnnotation: true };
  }

  private guessType(arg: TypeId): TypeId | undefined {
    const t = follow(arg);
    const substituted = this.substitutable.get(t);
    if (substituted !== undefined) {
      const subst = follow(substituted);
      if (subst === t || this.substitutable.has(subst)) return subst;
      else if (!get(subst, "TypeFunctionInstanceType")) return subst;
      else return this.guessType(subst);
    }
    if (get(t, "TypeFunctionInstanceType")) {
      const reducesTo = this.functionReducesTo.get(t);
      if (reducesTo !== undefined) return reducesTo;
    }
    return undefined;
  }

  private isNumericBinopFunction(instance: TypeFunctionInstanceType): boolean {
    const name = instance.function.name;
    return name === "add" || name === "sub" || name === "mul" || name === "div" || name === "idiv" || name === "pow" || name === "mod";
  }

  private isComparisonFunction(instance: TypeFunctionInstanceType): boolean {
    const name = instance.function.name;
    return name === "lt" || name === "le" || name === "eq";
  }

  private isOrAndFunction(instance: TypeFunctionInstanceType): boolean {
    return instance.function.name === "or" || instance.function.name === "and";
  }

  private isNotFunction(instance: TypeFunctionInstanceType): boolean {
    return instance.function.name === "not";
  }

  private isLenFunction(instance: TypeFunctionInstanceType): boolean {
    return instance.function.name === "len";
  }

  private isUnaryMinus(instance: TypeFunctionInstanceType): boolean {
    return instance.function.name === "unm";
  }

  /** An operand is assignable when it looks like a cyclic type function instance, or is a generic. */
  private operandIsAssignable(ty: TypeId): boolean {
    if (get(ty, "TypeFunctionInstanceType")) return true;
    if (get(ty, "GenericType")) return true;
    if (this.cyclicInstances.has(ty)) return true;
    return false;
  }

  private tryAssignOperandType(ty: TypeId): TypeId | undefined {
    // Innermost instances are collected first, so an instance used as an
    // operand may already have a guessed type.
    if (get(ty, "TypeFunctionInstanceType")) {
      const reducesTo = this.functionReducesTo.get(ty);
      if (reducesTo !== undefined) return reducesTo;
    }

    // A generic may have an inferred substitution.
    if (get(ty, "GenericType")) {
      const substituted = this.substitutable.get(ty);
      if (substituted !== undefined) return substituted;
    }

    // Nothing can be substituted for this operand.
    return undefined;
  }

  private normalize(ty: TypeId): NormalizedType | undefined {
    return this.normalizer.normalize(ty);
  }

  private step(): void {
    let t = this.toInfer.shift()!;
    t = follow(t);
    const tf = get(t, "TypeFunctionInstanceType");
    if (tf) this.inferTypeFunctionSubstitutions(t, tf);
  }

  private infer(): void {
    while (!this.done()) this.step();
  }

  private done(): boolean {
    return this.toInfer.length === 0;
  }

  private isFunctionGenericsSaturated(ftv: FunctionType, argsUsed: Set<TypeId>): boolean {
    const sameSize = ftv.generics.length === argsUsed.size;
    let allGenericsAppear = true;
    for (const gt of ftv.generics) allGenericsAppear = allGenericsAppear || argsUsed.has(gt);
    return sameSize && allGenericsAppear;
  }

  private inferTypeFunctionSubstitutions(ty: TypeId, instance: TypeFunctionInstanceType): void {
    let result: TypeFunctionInferenceResult;
    if (this.isNumericBinopFunction(instance)) result = this.inferNumericBinopFunction(instance);
    else if (this.isComparisonFunction(instance)) result = this.inferComparisonFunction(instance);
    else if (this.isOrAndFunction(instance)) result = this.inferOrAndFunction(instance);
    else if (this.isNotFunction(instance)) result = this.inferNotFunction(instance);
    else if (this.isLenFunction(instance)) result = this.inferLenFunction(instance);
    else if (this.isUnaryMinus(instance)) result = this.inferUnaryMinusFunction(instance);
    else result = { operandInference: [], functionResultInference: this.builtins.unknownType };

    const resultInference = follow(result.functionResultInference);
    if (!this.functionReducesTo.has(resultInference)) this.functionReducesTo.set(ty, resultInference);

    for (let i = 0; i < instance.typeArguments.length; i++) {
      if (i < result.operandInference.length) {
        const arg = follow(instance.typeArguments[i]!);
        const inference = follow(result.operandInference[i]!);
        if (get(arg, "TypeFunctionInstanceType")) {
          if (!this.functionReducesTo.has(arg)) this.functionReducesTo.set(arg, inference);
        } else if (get(arg, "GenericType")) this.substitutable.set(arg, inference);
      }
    }
  }

  private inferNumericBinopFunction(_instance: TypeFunctionInstanceType): TypeFunctionInferenceResult {
    return { operandInference: [this.builtins.numberType, this.builtins.numberType], functionResultInference: this.builtins.numberType };
  }

  private inferComparisonFunction(instance: TypeFunctionInstanceType): TypeFunctionInferenceResult {
    // The comparison functions are lt, le and eq; the heuristic takes them to
    // be functions from t -> t -> bool.
    let lhsTy = follow(instance.typeArguments[0]!);
    let rhsTy = follow(instance.typeArguments[1]!);

    const comparisonInference = (op: TypeId): TypeFunctionInferenceResult => ({
      operandInference: [op, op],
      functionResultInference: this.builtins.booleanType,
    });

    const lhsAssigned = this.tryAssignOperandType(lhsTy);
    if (lhsAssigned !== undefined) lhsTy = follow(lhsAssigned);
    const rhsAssigned = this.tryAssignOperandType(rhsTy);
    if (rhsAssigned !== undefined) rhsTy = follow(rhsAssigned);
    if (this.operandIsAssignable(lhsTy) && !this.operandIsAssignable(rhsTy)) return comparisonInference(rhsTy);
    if (this.operandIsAssignable(rhsTy) && !this.operandIsAssignable(lhsTy)) return comparisonInference(lhsTy);
    return comparisonInference(this.builtins.numberType);
  }

  private inferOrAndFunction(instance: TypeFunctionInstanceType): TypeFunctionInferenceResult {
    let lhsTy = follow(instance.typeArguments[0]!);
    let rhsTy = follow(instance.typeArguments[1]!);

    const lhsAssigned = this.tryAssignOperandType(lhsTy);
    if (lhsAssigned !== undefined) lhsTy = follow(lhsAssigned);
    const rhsAssigned = this.tryAssignOperandType(rhsTy);
    if (rhsAssigned !== undefined) rhsTy = follow(rhsAssigned);
    const defaultAndOrInference: TypeFunctionInferenceResult = {
      operandInference: [this.builtins.unknownType, this.builtins.unknownType],
      functionResultInference: this.builtins.booleanType,
    };

    // Luau normalizes the left operand for both of these.
    const lty = this.normalize(lhsTy);
    const rty = this.normalize(lhsTy);
    const lhsTruthy = lty ? lty.isTruthy() : false;
    const rhsTruthy = rty ? rty.isTruthy() : false;
    // Without good substitutions by the end, the default inference stands.
    if (instance.function.name === "or") {
      if (this.operandIsAssignable(lhsTy) && this.operandIsAssignable(rhsTy)) return defaultAndOrInference;
      if (this.operandIsAssignable(lhsTy)) return { operandInference: [this.builtins.unknownType, rhsTy], functionResultInference: rhsTy };
      if (this.operandIsAssignable(rhsTy)) return { operandInference: [lhsTy, this.builtins.unknownType], functionResultInference: lhsTy };
      if (lhsTruthy) return { operandInference: [lhsTy, rhsTy], functionResultInference: lhsTy };
      if (rhsTruthy) return { operandInference: [this.builtins.unknownType, rhsTy], functionResultInference: rhsTy };
    }

    if (instance.function.name === "and") {
      if (this.operandIsAssignable(lhsTy) && this.operandIsAssignable(rhsTy)) return defaultAndOrInference;
      if (this.operandIsAssignable(lhsTy)) return { operandInference: [], functionResultInference: rhsTy };
      if (this.operandIsAssignable(rhsTy)) return { operandInference: [], functionResultInference: lhsTy };
      if (lhsTruthy) return { operandInference: [lhsTy, rhsTy], functionResultInference: rhsTy };
      else return { operandInference: [lhsTy, rhsTy], functionResultInference: lhsTy };
    }

    return defaultAndOrInference;
  }

  private inferNotFunction(instance: TypeFunctionInstanceType): TypeFunctionInferenceResult {
    let opTy = follow(instance.typeArguments[0]!);
    const assigned = this.tryAssignOperandType(opTy);
    if (assigned !== undefined) opTy = follow(assigned);
    return { operandInference: [opTy], functionResultInference: this.builtins.booleanType };
  }

  private inferLenFunction(instance: TypeFunctionInstanceType): TypeFunctionInferenceResult {
    let opTy = follow(instance.typeArguments[0]!);
    const assigned = this.tryAssignOperandType(opTy);
    if (assigned !== undefined) opTy = follow(assigned);
    return { operandInference: [opTy], functionResultInference: this.builtins.numberType };
  }

  private inferUnaryMinusFunction(instance: TypeFunctionInstanceType): TypeFunctionInferenceResult {
    let opTy = follow(instance.typeArguments[0]!);
    const assigned = this.tryAssignOperandType(opTy);
    if (assigned !== undefined) opTy = follow(assigned);
    if (isNumber(opTy)) return { operandInference: [this.builtins.numberType], functionResultInference: this.builtins.numberType };
    return { operandInference: [this.builtins.unknownType], functionResultInference: this.builtins.numberType };
  }
}
