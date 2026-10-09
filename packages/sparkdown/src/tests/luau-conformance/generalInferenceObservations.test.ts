import { expect, test } from "vitest";
import { AstExprConstantString, AstExprFunction, AstLocal, AstStatBlock, AstStatLocalFunction, AstStatTypeAlias, AstTypeReference, AstTypeTypeof, QuoteStyle } from "../../compiler/typecheck/Ast";
import { Frontend } from "../../compiler/typecheck/Frontend";
import { Location, Position } from "../../compiler/typecheck/Location";
import { Mode } from "../../compiler/typecheck/Module";
import { boundType, first, functionType, get, follow } from "../../compiler/typecheck/Type";
import { firstArgumentUpperBoundContributorCount, interfaceTypeCount, resolvedSingleParameterAnnotation } from "./generalInferenceObservations";

function checkAnnotatedFunction() {
  const frontend = new Frontend();
  const location = new Location(new Position(0, 0), new Position(1, 3));
  const alias = new AstStatTypeAlias(location, "alias", location, [], [],
    new AstTypeTypeof(location, new AstExprConstantString(location, "hello", QuoteStyle.QuotedSimple)), false);
  const annotation = new AstTypeReference(location, undefined, "alias", undefined, location);
  const param = new AstLocal("param", location, undefined, 1, 0, annotation);
  const expression = new AstExprFunction(location, [], [], [], undefined, [param], false, location,
    new AstStatBlock(location, []), 1, "foo", undefined, undefined, location);
  const name = new AstLocal("foo", location, undefined, 0, 0, undefined);
  const root = new AstStatBlock(location, [alias, new AstStatLocalFunction(location, name, expression)]);
  const { module, errors } = frontend.checkSourceModule({ name: "MainModule", humanReadableName: "MainModule", root, hotcomments: [], parseErrors: [] }, Mode.Strict);
  expect(errors).toEqual([]);
  return { frontend, module, expression, annotation };
}

test("reads real checked annotation TypeIds, preserving identity rather than printed equality", () => {
  const { module, expression, annotation } = checkAnnotatedFunction();
  const observation = resolvedSingleParameterAnnotation(module, expression, "alias");
  expect(observation.annotationType).toBe(observation.aliasType);
  expect(observation.aliasType).toBe(module.getModuleScope().lookupType("alias")!.type);
  // Equal printing through a distinct BoundType must not pass an identity assertion.
  module.astResolvedTypes.set(annotation, module.internalTypes.addType(boundType(observation.annotationType)));
  expect(resolvedSingleParameterAnnotation(module, expression, "alias").annotationType).not.toBe(observation.aliasType);
  expect(() => resolvedSingleParameterAnnotation(module, expression, "absent")).toThrow("is missing");
  module.astResolvedTypes.delete(annotation);
  expect(() => resolvedSingleParameterAnnotation(module, expression, "alias")).toThrow("is missing");
});

test("counts only the actual interface TypeId arena", () => {
  const { module, frontend } = checkAnnotatedFunction();
  const initial = interfaceTypeCount(module);
  module.internalTypes.addType(boundType(frontend.builtinTypes.numberType));
  module.interfaceTypes.addTypePack([frontend.builtinTypes.numberType]);
  expect(interfaceTypeCount(module)).toBe(initial);
  module.interfaceTypes.addType(boundType(frontend.builtinTypes.numberType));
  expect(interfaceTypeCount(module)).toBe(initial + 1);
});

test("uses the original first argument as the contributor map key, including pack tails", () => {
  const { module, frontend } = checkAnnotatedFunction();
  const arena = module.internalTypes;
  const argument = arena.addType(boundType(frontend.builtinTypes.numberType));
  const args = arena.addTypePack([], arena.addTypePack([argument]));
  const type = arena.addType(functionType(args, arena.addTypePack([])));
  expect(first(args)).toBe(argument);
  expect(get(follow(type), "FunctionType")).toBeDefined();
  module.upperBoundContributors.set(frontend.builtinTypes.numberType, [[new Location(), frontend.builtinTypes.stringType]]);
  expect(firstArgumentUpperBoundContributorCount(module, type)).toBe(0);
  module.upperBoundContributors.set(argument, [[new Location(), frontend.builtinTypes.numberType], [new Location(), frontend.builtinTypes.stringType]]);
  expect(firstArgumentUpperBoundContributorCount(module, type)).toBe(2);
  expect(() => firstArgumentUpperBoundContributorCount(module, frontend.builtinTypes.numberType)).toThrow("requires a function");
});
