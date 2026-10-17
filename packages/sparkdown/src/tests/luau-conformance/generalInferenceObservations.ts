// Actual module observations required by pinned TypeInfer.test.cpp.
import type { AstExprFunction } from "../../compiler/typecheck/Ast";
import type { Module } from "../../compiler/typecheck/Module";
import { first, follow, get, type TypeId } from "../../compiler/typecheck/Type";

/** TypeInfer.test.cpp:395 counts TypeIds in the interface arena, not packs. */
export function interfaceTypeCount(module: Module): number {
  return module.interfaceTypes.types.length;
}

/** TypeInfer.test.cpp:1336 compares the recorded annotation TypeId by identity. */
export function resolvedSingleParameterAnnotation(
  module: Module,
  expression: AstExprFunction,
  aliasName: string,
): { annotationType: TypeId; aliasType: TypeId } {
  const parameter = expression.args[0];
  if (expression.args.length !== 1 || !parameter)
    throw new Error("resolved annotation observation requires exactly one parameter");
  const annotation = parameter.annotation;
  const annotationType = annotation ? module.astResolvedTypes.get(annotation) : undefined;
  const aliasType = module.getModuleScope().lookupType(aliasName)?.type;
  if (!annotationType || !aliasType)
    throw new Error("resolved annotation or named alias is missing");
  return { annotationType, aliasType };
}

/** TypeInfer.test.cpp:1621 indexes the map with first(fn.argTypes), without following that key. */
export function firstArgumentUpperBoundContributorCount(module: Module, type: TypeId): number {
  const fn = get(follow(type), "FunctionType");
  const argument = fn ? first(fn.argTypes) : undefined;
  if (!argument) throw new Error("upper-bound observation requires a function with an argument");
  return module.upperBoundContributors.get(argument)?.length ?? 0;
}
