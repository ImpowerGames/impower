// The builtin globals, and the magic functions that give some builtins special
// handling in the solver and the checker, ported from Luau's
// `BuiltinDefinitions.h`/`BuiltinDefinitions.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).

import {
  AstExprConstantBool,
  AstExprConstantNumber,
  AstExprConstantString,
  AstExprGlobal,
  AstExprIndexName,
  type AstExpr,
  type AstExprCall,
} from "./Ast";
import { shallowClone } from "./Clone";
import type { ConstraintSolver } from "./ConstraintSolver";
import { symbolName } from "./Def";
import builtinDefinitions from "./definitions/builtin.json";
import typeFunctionDefinitions from "./definitions/type-functions.json";
import { countMismatch, CountMismatchContext, typeMismatch } from "./Error";
import type { Frontend } from "./Frontend";
import type { GlobalTypes } from "./GlobalTypes";
import { Location } from "./Location";
import type { Binding, Scope } from "./Scope";
import {
  attachTag,
  boundType,
  boundTypePack,
  emplaceType,
  emplaceTypePack,
  first,
  flatten,
  follow,
  followPack,
  functionType,
  genericType,
  get,
  getMetatable,
  getPack,
  intersectionType,
  metatableType,
  negationType,
  persist,
  Polarity,
  Property,
  Props,
  TableIndexer,
  TableState,
  tableType,
  typeFunctionInstanceType,
  unionType,
  variadicTypePack,
  type BuiltinTypes,
  type MagicFunction,
  type MagicFunctionCallContext,
  type MagicFunctionTypeCheckContext,
  type TypeArena,
  type TypeId,
  type TypePackId,
} from "./Type";
import { ErrorSuppression, extendTypePack, reduceUnion, shouldSuppressErrors, trackInteriorFreeType, unwrapGroup } from "./TypeUtils";

export { matchTableFreeze, shouldTypestateForFirstArgument } from "./DataFlowGraph";

export const kRequireTagName = "require";

export function makeUnion(arena: TypeArena, types: TypeId[]): TypeId {
  return arena.addType(unionType(types));
}

export function makeIntersection(arena: TypeArena, types: TypeId[]): TypeId {
  return arena.addType(intersectionType(types));
}

export function makeOption(builtinTypes: BuiltinTypes, arena: TypeArena, t: TypeId): TypeId {
  return makeUnion(arena, [builtinTypes.nilType, t]);
}

export function makeFunction(
  arena: TypeArena,
  selfType: TypeId | undefined,
  paramTypes: TypeId[],
  retTypes: TypeId[],
  checked = false,
): TypeId {
  return makeGenericFunctionWithNames(arena, selfType, [], [], paramTypes, [], retTypes, checked);
}

export function makeGenericFunction(
  arena: TypeArena,
  selfType: TypeId | undefined,
  generics: TypeId[],
  genericPacks: TypePackId[],
  paramTypes: TypeId[],
  retTypes: TypeId[],
  checked = false,
): TypeId {
  return makeGenericFunctionWithNames(arena, selfType, generics, genericPacks, paramTypes, [], retTypes, checked);
}

export function makeFunctionWithNames(
  arena: TypeArena,
  selfType: TypeId | undefined,
  paramTypes: TypeId[],
  paramNames: string[],
  retTypes: TypeId[],
  checked = false,
): TypeId {
  return makeGenericFunctionWithNames(arena, selfType, [], [], paramTypes, paramNames, retTypes, checked);
}

export function makeGenericFunctionWithNames(
  arena: TypeArena,
  selfType: TypeId | undefined,
  generics: TypeId[],
  genericPacks: TypePackId[],
  paramTypes: TypeId[],
  paramNames: string[],
  retTypes: TypeId[],
  checked = false,
): TypeId {
  const params: TypeId[] = [];
  if (selfType) params.push(selfType);
  for (const p of paramTypes) params.push(p);

  const paramPack = arena.addTypePack(params);
  const retPack = arena.addTypePack([...retTypes]);
  const ftv = functionType(paramPack, retPack, { generics: [...generics], genericPacks: [...genericPacks], hasSelf: selfType !== undefined });

  if (selfType) {
    ftv.argNames.push({ name: "self", location: new Location() });
  }

  if (paramNames.length !== 0) {
    for (const p of paramNames) ftv.argNames.push({ name: p, location: new Location() });
  } else if (selfType) {
    for (let i = 0; i < paramTypes.length; i++) ftv.argNames.push(undefined);
  }

  ftv.isCheckedFunction = checked;

  return arena.addType(ftv);
}

export function attachMagicFunction(ty: TypeId, magic: MagicFunction): void {
  const ftv = get(ty, "FunctionType");
  if (ftv) ftv.magic = magic;
}

export function makeProperty(ty: TypeId, documentationSymbol?: string): Property {
  const prop = Property.rw(ty);
  prop.documentationSymbol = documentationSymbol;
  return prop;
}

export function addGlobalBinding(globals: GlobalTypes, name: string, ty: TypeId, packageName: string): void {
  addGlobalBindingInScope(globals, globals.globalScope, name, ty, packageName);
}

export function addGlobalBindingWithBinding(globals: GlobalTypes, name: string, binding: Binding): void {
  addGlobalBindingInScopeWithBinding(globals, globals.globalScope, name, binding);
}

export function addGlobalBindingInScope(globals: GlobalTypes, scope: Scope, name: string, ty: TypeId, packageName: string): void {
  const documentationSymbol = packageName + "/global/" + name;
  addGlobalBindingInScopeWithBinding(globals, scope, name, {
    typeId: ty,
    location: new Location(),
    deprecated: false,
    deprecatedSuggestion: "",
    documentationSymbol,
  });
}

export function addGlobalBindingInScopeWithBinding(_globals: GlobalTypes, scope: Scope, name: string, binding: Binding): void {
  scope.bindings.set(name, { ...binding });
}

export function tryGetGlobalBinding(globals: GlobalTypes, name: string): Binding | undefined {
  const binding = globals.globalScope.bindings.get(name);
  if (binding) return { ...binding };

  return undefined;
}

export function getGlobalBinding(globals: GlobalTypes, name: string): TypeId {
  const t = tryGetGlobalBinding(globals, name);
  return t!.typeId;
}

export function tryGetGlobalBindingRef(globals: GlobalTypes, name: string): Binding | undefined {
  return globals.globalScope.bindings.get(name);
}

export function assignPropDocumentationSymbols(props: Props, baseName: string): void {
  for (const [name, prop] of props) {
    prop.documentationSymbol = baseName + "." + name;
  }
}

function propAt(props: Props, name: string): Property {
  let prop = props.get(name);
  if (!prop) {
    prop = new Property();
    props.set(name, prop);
  }
  return prop;
}

function finalizeGlobalBindings(scope: Scope): void {
  for (const [symbol, binding] of scope.bindings) {
    persist(binding.typeId);

    const ttv = get(binding.typeId, "TableType");
    if (ttv) {
      if (ttv.name === undefined) ttv.name = "typeof(" + symbolName(symbol) + ")";
    }
  }
}

export function registerBuiltinGlobals(frontend: Frontend, globals: GlobalTypes): void {
  const arena = globals.globalTypes;
  const builtinTypes = globals.builtinTypes;
  const globalScope = globals.globalScope;

  builtinTypes.typeFunctions.addToScope(arena, globals.globalScope);

  frontend.loadDefinitionFile(globals, globals.globalScope, builtinDefinitions, "@luau");

  const genericK = arena.addType(genericType({ scope: globalScope, name: "K", polarity: Polarity.Mixed }));
  const genericV = arena.addType(genericType({ scope: globalScope, name: "V", polarity: Polarity.Mixed }));
  const mapOfKtoV = arena.addType(
    tableType({ indexer: new TableIndexer(genericK, genericV), level: globals.globalScope.level, state: TableState.Generic }),
  );

  const stringMetatableTy = getMetatable(builtinTypes.stringType, builtinTypes);
  const stringMetatableTable = get(follow(stringMetatableTy!), "TableType");

  const it = stringMetatableTable!.props.get("__index");

  addGlobalBinding(globals, "string", it!.readTy!, "@luau");
  addGlobalBinding(globals, "string", it!.writeTy!, "@luau");

  const vectorTypeFun = globals.globalScope.exportedTypeBindings.get("vector");
  if (vectorTypeFun) {
    const vectorTy = vectorTypeFun.type;
    const vectorCls = get(vectorTy, "ExternType")!;

    vectorCls.metatable = arena.addType(tableType({ state: TableState.Sealed }));
    const metatableTy = get(vectorCls.metatable, "TableType")!;

    metatableTy.props.set("__add", Property.rw(makeFunction(arena, vectorTy, [vectorTy], [vectorTy])));
    metatableTy.props.set("__sub", Property.rw(makeFunction(arena, vectorTy, [vectorTy], [vectorTy])));
    metatableTy.props.set("__unm", Property.rw(makeFunction(arena, vectorTy, [], [vectorTy])));

    const mulOverloads = [
      makeFunction(arena, vectorTy, [vectorTy], [vectorTy]),
      makeFunction(arena, vectorTy, [builtinTypes.numberType], [vectorTy]),
    ];
    metatableTy.props.set("__mul", Property.rw(makeIntersection(arena, [...mulOverloads])));
    metatableTy.props.set("__div", Property.rw(makeIntersection(arena, [...mulOverloads])));
    metatableTy.props.set("__idiv", Property.rw(makeIntersection(arena, [...mulOverloads])));
  }

  const nextArgsTypePack = arena.addTypePack([mapOfKtoV, makeOption(builtinTypes, arena, genericK)]);
  const nextRetsTypePack = arena.addTypePack([makeOption(builtinTypes, arena, genericK), genericV]);
  addGlobalBinding(
    globals,
    "next",
    arena.addType(functionType(nextArgsTypePack, nextRetsTypePack, { generics: [genericK, genericV], genericPacks: [] })),
    "@luau",
  );

  const pairsArgsTypePack = arena.addTypePack([mapOfKtoV]);

  const pairsNext = arena.addType(functionType(nextArgsTypePack, nextRetsTypePack));
  const pairsReturnTypePack = arena.addTypePack([pairsNext, mapOfKtoV, builtinTypes.nilType]);

  addGlobalBinding(
    globals,
    "pairs",
    arena.addType(functionType(pairsArgsTypePack, pairsReturnTypePack, { generics: [genericK, genericV], genericPacks: [] })),
    "@luau",
  );

  const genericMT = arena.addType(genericType({ scope: globalScope, name: "MT", polarity: Polarity.Mixed }));

  const genericT = arena.addType(genericType({ scope: globalScope, name: "T", polarity: Polarity.Mixed }));

  const getmtReturn = arena.addType(typeFunctionInstanceType(builtinTypes.typeFunctions.getmetatableFunc, [genericT]));
  addGlobalBinding(globals, "getmetatable", makeGenericFunction(arena, undefined, [genericT], [], [genericT], [getmtReturn]), "@luau");

  const setmtReturn = arena.addType(typeFunctionInstanceType(builtinTypes.typeFunctions.setmetatableFunc, [genericT, genericMT]));
  addGlobalBinding(
    globals,
    "setmetatable",
    makeGenericFunction(arena, undefined, [genericT, genericMT], [], [genericT, genericMT], [setmtReturn]),
    "@luau",
  );

  finalizeGlobalBindings(globals.globalScope);

  attachMagicFunction(getGlobalBinding(globals, "assert"), new MagicAssert());
  attachMagicFunction(getGlobalBinding(globals, "pcall"), new MagicPcall());

  const assertGenericT = arena.addType(genericType({ scope: globalScope, name: "T", polarity: Polarity.Mixed }));

  const refinedTy = arena.addType(
    typeFunctionInstanceType(
      builtinTypes.typeFunctions.intersectFunc,
      [assertGenericT, arena.addType(negationType(builtinTypes.falsyType))],
      [],
    ),
  );

  const assertTy = arena.addType(
    functionType(arena.addTypePack([assertGenericT, builtinTypes.optionalStringType]), arena.addTypePack([refinedTy]), {
      generics: [assertGenericT],
      genericPacks: [],
    }),
  );
  addGlobalBinding(globals, "assert", assertTy, "@luau");

  attachMagicFunction(getGlobalBinding(globals, "setmetatable"), new MagicSetMetatable());
  attachMagicFunction(getGlobalBinding(globals, "select"), new MagicSelect());

  const ttv = get(getGlobalBinding(globals, "table"), "TableType");
  if (ttv) {
    const genericTy = arena.addType(genericType({ scope: globalScope, name: "T", polarity: Polarity.Mixed }));
    const thePack = arena.addTypePack([genericTy]);
    const idTyWithMagic = arena.addType(functionType(thePack, thePack, { generics: [genericTy], genericPacks: [] }));
    ttv.props.set("freeze", makeProperty(idTyWithMagic, "@luau/global/table.freeze"));

    const idTy = arena.addType(functionType(thePack, thePack, { generics: [genericTy], genericPacks: [] }));

    ttv.props.set("clone", makeProperty(idTy, "@luau/global/table.clone"));

    propAt(ttv.props, "getn").deprecated = true;
    propAt(ttv.props, "getn").deprecatedSuggestion = "#";
    propAt(ttv.props, "foreach").deprecated = true;
    propAt(ttv.props, "foreachi").deprecated = true;

    attachMagicFunction(propAt(ttv.props, "pack").readTy!, new MagicPack());
    attachMagicFunction(propAt(ttv.props, "clone").readTy!, new MagicClone());
    attachMagicFunction(propAt(ttv.props, "freeze").readTy!, new MagicFreeze());
  }

  const requireTy = getGlobalBinding(globals, "require");
  attachTag(requireTy, kRequireTagName);
  attachMagicFunction(requireTy, new MagicRequire());

  globals.globalTypeFunctionScope.exportedTypeBindings.clear();
  for (const [name, typeFun] of globals.globalScope.exportedTypeBindings) {
    globals.globalTypeFunctionScope.exportedTypeBindings.set(name, typeFun);
  }
  globals.globalTypeFunctionScope.builtinTypeNames.clear();
  for (const name of globals.globalScope.builtinTypeNames) globals.globalTypeFunctionScope.builtinTypeNames.add(name);

  const typeFunctionRuntimeBindings = [
    "math",
    "table",
    "string",
    "bit32",
    "utf8",
    "buffer",

    "assert",
    "error",
    "print",
    "next",
    "ipairs",
    "pairs",
    "select",
    "unpack",
    "getmetatable",
    "setmetatable",
    "rawget",
    "rawset",
    "rawlen",
    "rawequal",
    "tonumber",
    "tostring",
    "type",
    "typeof",
    "pcall",
    "xpcall",
  ];

  for (const name of typeFunctionRuntimeBindings) {
    const binding = globals.globalScope.bindings.get(name);
    if (binding) globals.globalTypeFunctionScope.bindings.set(name, { ...binding });
  }

  frontend.loadDefinitionFile(globals, globals.globalTypeFunctionScope, typeFunctionDefinitions, "@luau");

  finalizeGlobalBindings(globals.globalTypeFunctionScope);
}

function asConstantString(expr: AstExpr | undefined): AstExprConstantString | undefined {
  return expr instanceof AstExprConstantString ? expr : undefined;
}

function isAlphaOrStar(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 42;
}

function parseFormatString(builtinTypes: BuiltinTypes, data: string, size: number): TypeId[] {
  const options = "cdiouxXeEfgGqs*";

  const result: TypeId[] = [];

  for (let i = 0; i < size; ++i) {
    if (data[i] === "%") {
      i++;

      if (i < size && data[i] === "%") continue;

      while (i < size && !isAlphaOrStar(data.charCodeAt(i))) i++;

      if (i === size) break;

      const c = data[i]!;
      if (c === "q" || c === "s") result.push(builtinTypes.stringType);
      else if (c === "*") result.push(builtinTypes.unknownType);
      else if (options.includes(c)) result.push(builtinTypes.numberType);
      else result.push(builtinTypes.errorRecoveryType(builtinTypes.anyType));
    }
  }

  return result;
}

class MagicFormat implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const arena = context.solver.arena;

    const iter = flatten(context.arguments).head[0];

    if (iter === undefined || shouldSuppressErrors(context.solver.normalizer, follow(iter)) === ErrorSuppression.Suppress) {
      const resultPack = arena.addTypePack([context.solver.builtinTypes.stringType]);
      emplaceTypePack(context.result, boundTypePack(resultPack));
      return true;
    }

    let fmt: AstExprConstantString | undefined;
    const index = context.callSite.func instanceof AstExprIndexName ? context.callSite.func : undefined;
    if (index && context.callSite.self) fmt = asConstantString(unwrapGroup(index.expr));

    if (!context.callSite.self && context.callSite.args.length > 0) fmt = asConstantString(context.callSite.args[0]);

    let formatString: string | undefined;
    if (fmt) formatString = fmt.value;
    else {
      const singleton = get(follow(iter), "SingletonType");
      if (singleton) {
        const stringSingleton = singleton.variant.kind === "StringSingleton" ? singleton.variant : undefined;
        if (stringSingleton) formatString = stringSingleton.value;
      }
    }

    if (formatString === undefined) return false;

    const expected = parseFormatString(context.solver.builtinTypes, formatString, formatString.length);
    const { head: params, tail } = flatten(context.arguments);

    const paramOffset = 1;

    for (let i = 0; i < expected.length && i + paramOffset < params.length; ++i) {
      context.solver.unify(context.constraint, params[i + paramOffset]!, expected[i]!);
    }

    const numActualParams = params.length;
    const numExpectedParams = expected.length + 1;

    if (numExpectedParams !== numActualParams && (!tail || numExpectedParams < numActualParams)) {
      context.solver.reportError(
        countMismatch(numExpectedParams, numActualParams, CountMismatchContext.Arg),
        context.callSite.location,
        context.constraint.moduleName!,
      );
    }

    const resultPack = arena.addTypePack([context.solver.builtinTypes.stringType]);
    emplaceTypePack(context.result, boundTypePack(resultPack));

    return true;
  }

  typeCheck(context: MagicFunctionTypeCheckContext): boolean {
    const callSite = context.callSite!;
    const iter = flatten(context.arguments).head[0];

    if (iter === undefined) {
      context.typechecker.reportError(
        countMismatch(1, 0, CountMismatchContext.Arg, { isVariadic: true, function: "string.format" }),
        callSite.location,
      );
      return true;
    }

    if (shouldSuppressErrors(context.typechecker.normalizer, follow(iter)) === ErrorSuppression.Suppress) {
      return true;
    }

    let fmt: AstExprConstantString | undefined;
    const index = callSite.func instanceof AstExprIndexName ? callSite.func : undefined;
    if (index && callSite.self) fmt = asConstantString(unwrapGroup(index.expr));

    if (!callSite.self && callSite.args.length > 0) fmt = asConstantString(callSite.args[0]);

    let formatString: string | undefined;
    if (fmt) formatString = fmt.value;
    else {
      const singleton = get(follow(iter), "SingletonType");
      if (singleton) {
        const stringSingleton = singleton.variant.kind === "StringSingleton" ? singleton.variant : undefined;
        if (stringSingleton) formatString = stringSingleton.value;
      }
    }

    if (formatString === undefined) return true;

    const expected = parseFormatString(context.builtinTypes, formatString, formatString.length);

    const { head: params } = flatten(context.arguments);

    const paramOffset = 1;
    const calledWithSelf = expected.length === callSite.args.length;
    for (let i = 0; i < expected.length && i + paramOffset < params.length; ++i) {
      const actualTy = params[i + paramOffset]!;
      const expectedTy = expected[i]!;
      const location = callSite.args[Math.min(callSite.args.length - 1, i + (calledWithSelf ? 0 : paramOffset))]!.location;
      const result = context.typechecker.subtyping.isSubtype(actualTy, expectedTy, context.checkScope);

      if (!result.isSubtype) {
        switch (shouldSuppressErrors(context.typechecker.normalizer, actualTy)) {
          case ErrorSuppression.Suppress:
            break;
          case ErrorSuppression.NormalizationFailed:
            break;
          case ErrorSuppression.DoNotSuppress: {
            const reasonings = context.typechecker.explainReasonings(actualTy, expectedTy, location, result);

            if (!reasonings.suppressed) {
              context.typechecker.reportError(typeMismatch(expectedTy, actualTy, { reason: reasonings.toString() }), location);
            }
            break;
          }
        }
      }
    }

    return true;
  }
}

function parsePatternString(builtinTypes: BuiltinTypes, data: string, size: number): TypeId[] {
  const result: TypeId[] = [];
  let depth = 0;
  let parsingSet = false;

  for (let i = 0; i < size; ++i) {
    if (data[i] === "%") {
      ++i;
      if (!parsingSet && i < size && data[i] === "b") i += 2;
    } else if (!parsingSet && data[i] === "[") {
      parsingSet = true;
      if (i + 1 < size && data[i + 1] === "]") i += 1;
    } else if (parsingSet && data[i] === "]") {
      parsingSet = false;
    } else if (data[i] === "(") {
      if (parsingSet) continue;

      if (i + 1 < size && data[i + 1] === ")") {
        i++;
        result.push(builtinTypes.optionalNumberType);
        continue;
      }

      ++depth;
      result.push(builtinTypes.optionalStringType);
    } else if (data[i] === ")") {
      if (parsingSet) continue;

      --depth;

      if (depth < 0) break;
    }
  }

  if (depth !== 0 || parsingSet) return [];

  if (result.length === 0) result.push(builtinTypes.optionalStringType);

  return result;
}

class MagicGmatch implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const { head: params } = flatten(context.arguments);

    if (params.length !== 2) return false;

    const arena = context.solver.arena;

    let pattern: AstExprConstantString | undefined;
    const index = context.callSite.self ? 0 : 1;
    if (context.callSite.args.length > index) pattern = asConstantString(context.callSite.args[index]);

    if (!pattern) return false;

    const returnTypes = parsePatternString(context.solver.builtinTypes, pattern.value, pattern.value.length);

    if (returnTypes.length === 0) return false;

    context.solver.unify(context.constraint, params[0]!, context.solver.builtinTypes.stringType);

    const emptyPack = arena.addTypePack([]);
    const returnList = arena.addTypePack(returnTypes);
    const iteratorType = arena.addType(functionType(emptyPack, returnList));
    const resTypePack = arena.addTypePack([iteratorType]);
    emplaceTypePack(context.result, boundTypePack(resTypePack));

    return true;
  }
}

class MagicMatch implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const { head: params } = flatten(context.arguments);

    if (params.length < 2 || params.length > 3) return false;

    const arena = context.solver.arena;

    let pattern: AstExprConstantString | undefined;
    const patternIndex = context.callSite.self ? 0 : 1;
    if (context.callSite.args.length > patternIndex) pattern = asConstantString(context.callSite.args[patternIndex]);

    if (!pattern) return false;

    const returnTypes = parsePatternString(context.solver.builtinTypes, pattern.value, pattern.value.length);

    if (returnTypes.length === 0) return false;

    context.solver.unify(context.constraint, params[0]!, context.solver.builtinTypes.stringType);

    const optionalNumber = arena.addType(unionType([context.solver.builtinTypes.nilType, context.solver.builtinTypes.numberType]));

    const initIndex = context.callSite.self ? 1 : 2;
    if (params.length === 3 && context.callSite.args.length > initIndex) {
      context.solver.unify(context.constraint, params[2]!, optionalNumber);
    }

    const returnList = arena.addTypePack(returnTypes);
    emplaceTypePack(context.result, boundTypePack(returnList));

    return true;
  }
}

class MagicFind implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const { head: params } = flatten(context.arguments);

    if (params.length < 2 || params.length > 4) return false;

    const arena = context.solver.arena;
    const builtinTypes = context.solver.builtinTypes;

    let pattern: AstExprConstantString | undefined;
    const patternIndex = context.callSite.self ? 0 : 1;
    if (context.callSite.args.length > patternIndex) pattern = asConstantString(context.callSite.args[patternIndex]);

    if (!pattern) return false;

    let plain = false;
    const plainIndex = context.callSite.self ? 2 : 3;
    if (context.callSite.args.length > plainIndex) {
      const arg = context.callSite.args[plainIndex];
      const p = arg instanceof AstExprConstantBool ? arg : undefined;
      plain = p !== undefined && p.value;
    }

    let returnTypes: TypeId[] = [];
    if (!plain) {
      returnTypes = parsePatternString(builtinTypes, pattern.value, pattern.value.length);

      if (returnTypes.length === 0) return false;
    }

    context.solver.unify(context.constraint, params[0]!, builtinTypes.stringType);

    const optionalNumber = arena.addType(unionType([builtinTypes.nilType, builtinTypes.numberType]));
    const optionalBoolean = arena.addType(unionType([builtinTypes.nilType, builtinTypes.booleanType]));

    const initIndex = context.callSite.self ? 1 : 2;
    if (params.length >= 3 && context.callSite.args.length > initIndex) {
      context.solver.unify(context.constraint, params[2]!, optionalNumber);
    }

    if (params.length === 4 && context.callSite.args.length > plainIndex) {
      context.solver.unify(context.constraint, params[3]!, optionalBoolean);
    }

    returnTypes.unshift(optionalNumber, optionalNumber);

    const returnList = arena.addTypePack(returnTypes);
    emplaceTypePack(context.result, boundTypePack(returnList));
    return true;
  }
}

class MagicPcall implements MagicFunction {
  infer(ctx: MagicFunctionCallContext): boolean {
    const { head: argHead } = flatten(ctx.arguments);

    if (argHead.length === 0) return false;

    const fnTy = follow(argHead[0]!);
    const fn = get(fnTy, "FunctionType");
    if (!fn) return false;

    const { head: fnReturnHead, tail: fnReturnTail } = flatten(fn.retTypes);
    if (fnReturnHead.length !== 0 || fnReturnTail !== undefined) return false;

    const res = ctx.solver.arena.addTypePack([ctx.solver.builtinTypes.booleanType, ctx.solver.builtinTypes.unknownType]);
    emplaceTypePack(ctx.result, boundTypePack(res));

    return true;
  }
}

export function makeStringMetatable(builtinTypes: BuiltinTypes): TypeId {
  const arena = builtinTypes.arena;

  const nilType = builtinTypes.nilType;
  const numberType = builtinTypes.numberType;
  const booleanType = builtinTypes.booleanType;
  const stringType = builtinTypes.stringType;

  const optionalNumber = arena.addType(unionType([nilType, numberType]));
  const optionalString = arena.addType(unionType([nilType, stringType]));
  const optionalBoolean = arena.addType(unionType([nilType, booleanType]));

  const oneStringPack = arena.addTypePack([stringType]);

  const variadicTailPack = builtinTypes.unknownTypePack;
  const emptyPack = arena.addTypePack([]);
  const stringVariadicList = arena.addTypePack(variadicTypePack(stringType));
  const numberVariadicList = arena.addTypePack(variadicTypePack(numberType));

  const formatFTV = functionType(arena.addTypePack([stringType], variadicTailPack), oneStringPack);
  formatFTV.isCheckedFunction = true;
  const formatFn = arena.addType(formatFTV);
  attachMagicFunction(formatFn, new MagicFormat());

  const stringToStringType = makeGenericFunctionWithNames(arena, undefined, [], [], [stringType], [], [stringType], true);

  const replArgType = arena.addType(
    unionType([
      stringType,
      arena.addType(tableType({ indexer: new TableIndexer(stringType, stringType), state: TableState.Generic })),
      makeGenericFunctionWithNames(arena, undefined, [], [], [stringType], [], [stringType], false),
    ]),
  );
  const gsubFunc = makeGenericFunctionWithNames(
    arena,
    stringType,
    [],
    [],
    [stringType, replArgType, optionalNumber],
    [],
    [stringType, numberType],
    false,
  );
  const gmatchFunc = makeGenericFunctionWithNames(
    arena,
    stringType,
    [],
    [],
    [stringType],
    [],
    [arena.addType(functionType(emptyPack, stringVariadicList))],
    true,
  );
  attachMagicFunction(gmatchFunc, new MagicGmatch());

  const matchFuncTy = functionType(arena.addTypePack([stringType, stringType, optionalNumber]), arena.addTypePack(variadicTypePack(stringType)));
  matchFuncTy.isCheckedFunction = true;
  const matchFunc = arena.addType(matchFuncTy);
  attachMagicFunction(matchFunc, new MagicMatch());

  const findFuncTy = functionType(
    arena.addTypePack([stringType, stringType, optionalNumber, optionalBoolean]),
    arena.addTypePack([optionalNumber, optionalNumber], stringVariadicList),
  );
  findFuncTy.isCheckedFunction = true;
  const findFunc = arena.addType(findFuncTy);
  attachMagicFunction(findFunc, new MagicFind());

  const stringDotByte = functionType(arena.addTypePack([stringType, optionalNumber, optionalNumber]), numberVariadicList);
  stringDotByte.isCheckedFunction = true;

  const stringDotChar = functionType(numberVariadicList, arena.addTypePack([stringType]));
  stringDotChar.isCheckedFunction = true;

  const stringDotUnpack = functionType(arena.addTypePack([stringType, stringType, optionalNumber]), variadicTailPack);
  stringDotUnpack.isCheckedFunction = true;

  const stringLib = new Props([
    ["byte", Property.rw(arena.addType(stringDotByte))],
    ["char", Property.rw(arena.addType(stringDotChar))],
    ["find", Property.rw(findFunc)],
    ["format", Property.rw(formatFn)],
    ["gmatch", Property.rw(gmatchFunc)],
    ["gsub", Property.rw(gsubFunc)],
    ["len", Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [], [], [numberType], true))],
    ["lower", Property.rw(stringToStringType)],
    ["match", Property.rw(matchFunc)],
    ["rep", Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [numberType], [], [stringType], true))],
    ["reverse", Property.rw(stringToStringType)],
    [
      "sub",
      Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [numberType, optionalNumber], [], [stringType], true)),
    ],
    ["upper", Property.rw(stringToStringType)],
    [
      "split",
      Property.rw(
        makeGenericFunctionWithNames(
          arena,
          stringType,
          [],
          [],
          [optionalString],
          [],
          [arena.addType(tableType({ indexer: new TableIndexer(numberType, stringType), state: TableState.Sealed }))],
          true,
        ),
      ),
    ],
    ["pack", Property.rw(arena.addType(functionType(arena.addTypePack([stringType], variadicTailPack), oneStringPack)))],
    ["packsize", Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [], [], [numberType], true))],
    ["unpack", Property.rw(arena.addType(stringDotUnpack))],
  ]);

  assignPropDocumentationSymbols(stringLib, "@luau/global/string");

  const tableTy = arena.addType(tableType({ props: stringLib, state: TableState.Sealed }));

  const ttv = get(tableTy, "TableType");
  if (ttv) ttv.name = "typeof(string)";

  return arena.addType(tableType({ props: new Props([["__index", Property.rw(tableTy)]]), state: TableState.Sealed }));
}

function doubleToInt(value: number): number {
  return value > -2147483649 && value < 2147483648 ? Math.trunc(value) : -2147483648;
}

class MagicSelect implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    if (context.callSite.args.length <= 0) {
      context.solver.reportError(
        { kind: "GenericError", message: "select should take 1 or more arguments" },
        context.callSite.location,
        context.constraint.moduleName!,
      );
      return false;
    }

    const arg1 = context.callSite.args[0]!;

    if (arg1 instanceof AstExprConstantNumber) {
      const num = arg1;
      const { head: v, tail } = flatten(context.arguments);

      const offset = doubleToInt(num.value);
      if (offset > 0) {
        if (offset < v.length) {
          const res = v.slice(offset);
          const resTypePack = context.solver.arena.addTypePack(res, tail);
          emplaceTypePack(context.result, boundTypePack(resTypePack));
        } else if (tail) emplaceTypePack(context.result, boundTypePack(tail));

        return true;
      }

      return false;
    }

    if (arg1 instanceof AstExprConstantString) {
      const str = arg1;
      if (str.value.length === 1 && str.value[0] === "#") {
        const numberTypePack = context.solver.arena.addTypePack([context.solver.builtinTypes.numberType]);
        emplaceTypePack(context.result, boundTypePack(numberTypePack));
        return true;
      }
    }

    return false;
  }
}

class MagicSetMetatable implements MagicFunction {
  infer(_ctx: MagicFunctionCallContext): boolean {
    return false;
  }
}

class MagicAssert implements MagicFunction {
  infer(_ctx: MagicFunctionCallContext): boolean {
    return false;
  }
}

class MagicPack implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const arena = context.solver.arena;

    const { head: paramTypes, tail: paramTail } = flatten(context.arguments);

    let options: TypeId[] = [];
    for (const type of paramTypes) options.push(type);

    if (paramTail) {
      const vtp = getPack(paramTail, "VariadicTypePack");
      if (vtp) options.push(vtp.ty);
    }

    options = reduceUnion(options);

    let result: TypeId;
    if (options.length === 0) result = context.solver.builtinTypes.nilType;
    else if (options.length === 1) result = options[0]!;
    else result = arena.addType(unionType(options));

    const numberType = context.solver.builtinTypes.numberType;
    const packedTable = arena.addType(
      tableType({ props: new Props([["n", Property.rw(numberType)]]), indexer: new TableIndexer(numberType, result), state: TableState.Sealed }),
    );

    const tableTypePack = arena.addTypePack([packedTable]);
    emplaceTypePack(context.result, boundTypePack(tableTypePack));

    return true;
  }
}

class MagicClone implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const arena = context.solver.arena;

    const { head: paramTypes } = flatten(context.arguments);
    if (paramTypes.length === 0 || context.callSite.args.length === 0) {
      context.solver.reportError(countMismatch(1, 0, CountMismatchContext.Arg), context.callSite.argLocation, context.constraint.moduleName!);
      return false;
    }

    const inputType = follow(paramTypes[0]!);

    if (!get(inputType, "TableType")) return false;

    const resultType = shallowClone(inputType, arena, true);

    const tableTy = get(resultType, "TableType");
    if (tableTy) {
      tableTy.scope = context.constraint.scope;
    }

    trackInteriorFreeType(context.constraint.scope, resultType);

    const clonedTypePack = arena.addTypePack([resultType]);
    emplaceTypePack(context.result, boundTypePack(clonedTypePack));

    return true;
  }
}

function freezeTable(inputType: TypeId, context: MagicFunctionCallContext): TypeId | undefined {
  const arena = context.solver.arena;
  inputType = follow(inputType);
  const mt = get(inputType, "MetatableType");
  if (mt) {
    const frozenTable = freezeTable(mt.table, context);

    if (!frozenTable) return undefined;

    const resultType = arena.addType(metatableType(frozenTable, mt.metatable, mt.syntheticName));

    return resultType;
  }

  if (get(inputType, "TableType")) {
    const resultType = shallowClone(inputType, arena, true);
    const tableTy = get(resultType, "TableType")!;
    tableTy.state = TableState.Sealed;

    for (const [name, prop] of tableTy.props) {
      if (prop.isWriteOnly()) tableTy.props.delete(name);
      else prop.writeTy = undefined;
    }

    return resultType;
  }

  return undefined;
}

class MagicFreeze implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const arena = context.solver.arena;
    const dfg = context.solver.dfg;
    const scope = context.constraint.scope;

    const { head: paramTypes } = extendTypePack(arena, context.solver.builtinTypes, context.arguments, 1);
    if (paramTypes.length === 0 || context.callSite.args.length === 0) return false;

    const inputType = follow(paramTypes[0]!);

    const targetExpr = context.callSite.args[0]!;
    const resultDef = dfg.getDefOptional(targetExpr);
    const resultTy = resultDef ? scope.lookupDef(resultDef) : undefined;

    if (resultTy && !get(follow(resultTy), "BlockedType")) {
      return false;
    }

    const frozenType = freezeTable(inputType, context);

    if (!frozenType) {
      if (resultTy) emplaceType(resultTy, boundType(context.solver.builtinTypes.errorType));
      emplaceTypePack(context.result, boundTypePack(context.solver.builtinTypes.errorTypePack));

      return true;
    }

    if (resultTy) emplaceType(resultTy, boundType(frozenType));
    emplaceTypePack(context.result, boundTypePack(arena.addTypePack([frozenType])));

    return true;
  }

  typeCheck(ctx: MagicFunctionTypeCheckContext): boolean {
    const callSite = ctx.callSite!;
    const { head: paramTypes, tail: paramTail } = flatten(ctx.arguments);

    if (paramTypes.length < 1 && !paramTail) {
      ctx.typechecker.reportError(
        countMismatch(1, 0, CountMismatchContext.Arg, { maximum: 1, isVariadic: false, function: "table.freeze" }),
        callSite.location,
      );
      return true;
    }

    let firstParamType: TypeId | undefined;

    if (paramTypes.length > 0) {
      firstParamType = paramTypes[0];
    } else if (paramTail) {
      firstParamType = first(paramTail);
    }

    if (firstParamType) {
      ctx.typechecker.testIsSubtype(follow(firstParamType), ctx.builtinTypes.tableType, callSite.location);
    } else {
      const tableTyPack = ctx.typechecker.module.internalTypes.addTypePack([ctx.typechecker.builtinTypes.tableType]);
      ctx.typechecker.testIsSubtypePack(followPack(ctx.arguments), tableTyPack, callSite.location);
      return true;
    }

    if (paramTypes.length > 1) {
      ctx.typechecker.reportError(
        countMismatch(1, callSite.args.length, CountMismatchContext.Arg, { maximum: 1, isVariadic: false, function: "table.freeze" }),
        callSite.location,
      );
    }

    return true;
  }
}

function checkRequirePathNewSolver(solver: ConstraintSolver, expr: AstExpr, moduleName: string): boolean {
  let good = true;
  let indexExpr = expr instanceof AstExprIndexName ? expr : undefined;

  while (indexExpr) {
    if (indexExpr.index === "parent") {
      solver.reportError({ kind: "DeprecatedApiUsed", symbol: "parent", useInstead: "Parent" }, indexExpr.indexLocation, moduleName);
      good = false;
    }

    indexExpr = indexExpr.expr instanceof AstExprIndexName ? indexExpr.expr : undefined;
  }

  return good;
}

export class MagicRequire implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    if (context.callSite.args.length !== 1) {
      context.solver.reportError(
        { kind: "GenericError", message: "require takes 1 argument" },
        context.callSite.location,
        context.constraint.moduleName!,
      );
      return false;
    }

    if (!checkRequirePathNewSolver(context.solver, context.callSite.args[0]!, context.constraint.moduleName!)) return false;

    const resolveFrom = context.constraint.moduleName!;

    const moduleInfo = context.solver.moduleResolver.resolveModuleInfo(resolveFrom, context.callSite);
    if (moduleInfo) {
      const moduleType = context.solver.resolveModule(moduleInfo, context.callSite.location, context.constraint.moduleName!);
      const moduleResult = context.solver.arena.addTypePack([moduleType]);
      emplaceTypePack(context.result, boundTypePack(moduleResult));

      return true;
    }

    return false;
  }
}

export function matchSetMetatable(call: AstExprCall): boolean {
  const smt = "setmetatable";

  if (call.args.length !== 2) return false;

  const funcAsGlobal = call.func instanceof AstExprGlobal ? call.func : undefined;
  if (!funcAsGlobal || funcAsGlobal.name !== smt) return false;

  return true;
}

export function matchAssert(call: AstExprCall): boolean {
  if (call.args.length < 1) return false;

  const funcAsGlobal = call.func instanceof AstExprGlobal ? call.func : undefined;
  if (!funcAsGlobal || funcAsGlobal.name !== "assert") return false;

  return true;
}

export function matchTypeOf(call: AstExprCall): boolean {
  if (call.args.length !== 1) return false;

  const funcAsGlobal = call.func instanceof AstExprGlobal ? call.func : undefined;
  if (!funcAsGlobal || (funcAsGlobal.name !== "typeof" && funcAsGlobal.name !== "type")) return false;

  return true;
}
