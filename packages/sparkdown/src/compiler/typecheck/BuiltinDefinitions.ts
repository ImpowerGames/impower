// The builtin globals, and the magic functions that give some builtins special
// handling in the solver and the checker, ported from Luau's
// `BuiltinDefinitions.h`/`BuiltinDefinitions.cpp`; Luau is MIT-licensed (see
// `LICENSE-luau.txt`).
//
// Most builtins are declared in Luau source (`EmbeddedBuiltinDefinitions.ts`)
// and parsed into JSON at build time. `registerBuiltinGlobals` loads that data
// and then builds the few
// types the declaration syntax cannot express, such as `pairs`, `next`,
// `getmetatable` and `setmetatable`, and the string metatable.

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

/** The tag `registerBuiltinGlobals` attaches to the type of `require`. */
export const kRequireTagName = "require";

export function makeUnion(arena: TypeArena, types: TypeId[]): TypeId {
  return arena.addType(unionType(types));
}

export function makeIntersection(arena: TypeArena, types: TypeId[]): TypeId {
  return arena.addType(intersectionType(types));
}

/** The optional type `t?`. */
export function makeOption(builtinTypes: BuiltinTypes, arena: TypeArena, t: TypeId): TypeId {
  return makeUnion(arena, [builtinTypes.nilType, t]);
}

/** A monomorphic function type, for writing builtin definitions in code. */
export function makeFunction(
  arena: TypeArena,
  selfType: TypeId | undefined,
  paramTypes: TypeId[],
  retTypes: TypeId[],
  checked = false,
): TypeId {
  return makeGenericFunctionWithNames(arena, selfType, [], [], paramTypes, [], retTypes, checked);
}

/** A polymorphic function type, for writing builtin definitions in code. */
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

/** A monomorphic function type with named parameters, for writing builtin definitions in code. */
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

/**
 * A polymorphic function type with named parameters, for writing builtin
 * definitions in code. A self type becomes the first parameter, named `self`.
 */
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
    // With `self` named, the remaining parameters still need their (empty) slots.
    for (let i = 0; i < paramTypes.length; i++) ftv.argNames.push(undefined);
  }

  ftv.isCheckedFunction = checked;

  return arena.addType(ftv);
}

/** Attaches a magic function to a function type; other types are left as they are. */
export function attachMagicFunction(ty: TypeId, magic: MagicFunction): void {
  const ftv = get(ty, "FunctionType");
  if (ftv) ftv.magic = magic;
}

/** A read-write property with the given documentation symbol. */
export function makeProperty(ty: TypeId, documentationSymbol?: string): Property {
  const prop = Property.rw(ty);
  prop.documentationSymbol = documentationSymbol;
  return prop;
}

/** Binds a global in the global scope, documented as `<packageName>/global/<name>`. */
export function addGlobalBinding(globals: GlobalTypes, name: string, ty: TypeId, packageName: string): void {
  addGlobalBindingInScope(globals, globals.globalScope, name, ty, packageName);
}

export function addGlobalBindingWithBinding(globals: GlobalTypes, name: string, binding: Binding): void {
  addGlobalBindingInScopeWithBinding(globals, globals.globalScope, name, binding);
}

/** Binds a global in the given scope, documented as `<packageName>/global/<name>`. */
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

/** A copy of a global's binding in the global scope, if it has one. */
export function tryGetGlobalBinding(globals: GlobalTypes, name: string): Binding | undefined {
  const binding = globals.globalScope.bindings.get(name);
  if (binding) return { ...binding };

  return undefined;
}

/** The type of a global the global scope binds. */
export function getGlobalBinding(globals: GlobalTypes, name: string): TypeId {
  const t = tryGetGlobalBinding(globals, name);
  return t!.typeId;
}

/** A global's binding in the global scope itself, to change in place, if it has one. */
export function tryGetGlobalBindingRef(globals: GlobalTypes, name: string): Binding | undefined {
  return globals.globalScope.bindings.get(name);
}

/** Documents each property as `<baseName>.<name>`. */
export function assignPropDocumentationSymbols(props: Props, baseName: string): void {
  for (const [name, prop] of props) {
    prop.documentationSymbol = baseName + "." + name;
  }
}

/** The property of the given name, added empty when there is none, as `std::map::operator[]` does. */
function propAt(props: Props, name: string): Property {
  let prop = props.get(name);
  if (!prop) {
    prop = new Property();
    props.set(name, prop);
  }
  return prop;
}

/** Makes every bound type persistent, and names each unnamed table `typeof(<global>)`. */
function finalizeGlobalBindings(scope: Scope): void {
  for (const [symbol, binding] of scope.bindings) {
    persist(binding.typeId);

    const ttv = get(binding.typeId, "TableType");
    if (ttv) {
      if (ttv.name === undefined) ttv.name = "typeof(" + symbolName(symbol) + ")";
    }
  }
}

/**
 * Loads the builtin definitions into the global scope and the scope type
 * functions run in, then adds the builtins the definition syntax cannot
 * express and attaches the magic functions.
 */
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

  // The metatable of `vector`.
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

  // next<K, V>(t: Table<K, V>, i: K?) -> (K?, V)
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

  // pairs<K, V>(t: Table<K, V>) -> ((Table<K, V>, K?) -> (K, V), Table<K, V>, nil)
  addGlobalBinding(
    globals,
    "pairs",
    arena.addType(functionType(pairsArgsTypePack, pairsReturnTypePack, { generics: [genericK, genericV], genericPacks: [] })),
    "@luau",
  );

  const genericMT = arena.addType(genericType({ scope: globalScope, name: "MT", polarity: Polarity.Mixed }));

  const genericT = arena.addType(genericType({ scope: globalScope, name: "T", polarity: Polarity.Mixed }));

  // getmetatable : <T>(T) -> getmetatable<T>
  const getmtReturn = arena.addType(typeFunctionInstanceType(builtinTypes.typeFunctions.getmetatableFunc, [genericT]));
  addGlobalBinding(globals, "getmetatable", makeGenericFunction(arena, undefined, [genericT], [], [genericT], [getmtReturn]), "@luau");

  // setmetatable<T: {}, MT>(T, MT) -> setmetatable<T, MT>
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

  // declare function assert<T>(value: T, errorMessage: string?): intersect<T, ~(false?)>
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
    // The new solver has no generic tables (CLI-114044), which act like
    // generics constrained to the top table type, so these functions use
    // unconstrained generics instead.
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

  // The global scope cannot be the parent of the type function environment,
  // because the embedder can change it, so the environment gets copies.
  globals.globalTypeFunctionScope.exportedTypeBindings.clear();
  for (const [name, typeFun] of globals.globalScope.exportedTypeBindings) {
    globals.globalTypeFunctionScope.exportedTypeBindings.set(name, typeFun);
  }
  globals.globalTypeFunctionScope.builtinTypeNames.clear();
  for (const name of globals.globalScope.builtinTypeNames) globals.globalTypeFunctionScope.builtinTypeNames.add(name);

  // The type function runtime removes some standard libraries and globals, so it gets only these.
  const typeFunctionRuntimeBindings = [
    // Libraries
    "math",
    "table",
    "string",
    "bit32",
    "utf8",
    "buffer",

    // Globals
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
    // The builtin definitions declare every one of these names.
    const binding = globals.globalScope.bindings.get(name);
    if (binding) globals.globalTypeFunctionScope.bindings.set(name, { ...binding });
  }

  frontend.loadDefinitionFile(globals, globals.globalTypeFunctionScope, typeFunctionDefinitions, "@luau");

  finalizeGlobalBindings(globals.globalTypeFunctionScope);
}

/** An expression as a constant string, as Luau's `expr->as<AstExprConstantString>()`. */
function asConstantString(expr: AstExpr | undefined): AstExprConstantString | undefined {
  return expr instanceof AstExprConstantString ? expr : undefined;
}

/** Whether a byte is an ASCII letter or `*`, which is `c > 0 && (isalpha(c) || c == '*')` for a C `char` in the C locale. */
function isAlphaOrStar(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 42;
}

/** The types the conversions of a `string.format` format string expect, in order. */
function parseFormatString(builtinTypes: BuiltinTypes, data: string, size: number): TypeId[] {
  const options = "cdiouxXeEfgGqs*";

  const result: TypeId[] = [];

  for (let i = 0; i < size; ++i) {
    if (data[i] === "%") {
      i++;

      if (i < size && data[i] === "%") continue;

      // Every character before the first letter or `*`, such as flags and precision, is skipped.
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

/**
 * `string.format`: the arguments after a constant format string must match
 * its conversions. The solver unifies them, and the checker checks them
 * once their types are final.
 */
class MagicFormat implements MagicFunction {
  infer(context: MagicFunctionCallContext): boolean {
    const arena = context.solver.arena;

    const iter = flatten(context.arguments).head[0];

    // `string.format` reports no errors when its format string suppresses errors.
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

    // The prefix is unified one argument at a time, which matters when any of the types are free.
    for (let i = 0; i < expected.length && i + paramOffset < params.length; ++i) {
      context.solver.unify(context.constraint, params[i + paramOffset]!, expected[i]!);
    }

    // A known argument count, or one that is too many for sure, is an error.
    const numActualParams = params.length;
    const numExpectedParams = expected.length + 1; // + 1 for the format string

    if (numExpectedParams !== numActualParams && (!tail || numExpectedParams < numActualParams)) {
      context.solver.reportError(
        countMismatch(numExpectedParams, numActualParams, CountMismatchContext.Arg),
        context.callSite.location,
        context.constraint.moduleName!,
      );
    }

    // This runs at solve time, so it only has to give the result of the call.
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

    // `string.format` reports no errors when its format string suppresses errors.
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

    // CLI-150726: the arguments are checked one parameter at a time, so a
    // call such as `string.format("%s %d %s", foo())`, where `foo` returns
    // `...string`, is allowed although it should not be.

    const expected = parseFormatString(context.builtinTypes, formatString, formatString.length);

    const { head: params } = flatten(context.arguments);

    const paramOffset = 1;
    // Whether the call used `:` shows in how many argument expressions there are for the types the format expects.
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

/**
 * The types the captures of a Lua pattern produce, in order: `string?` for
 * each capture and `number?` for each position capture `()`. A pattern without
 * captures produces its whole match; an unbalanced one produces nothing.
 */
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

/** `string.gmatch` with a constant pattern: the iterator returns the pattern's captures. */
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

/** `string.match` with a constant pattern: the call returns the pattern's captures. */
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

/**
 * `string.find` with a constant pattern: the call returns the match's start
 * and end, then the pattern's captures unless the search is plain.
 */
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

/**
 * `pcall` of a function that returns no values returns `(boolean, unknown)`;
 * any other call is inferred from the type `pcall` is declared with.
 */
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

/** The metatable of `string`: its `__index` is the `string` library, whose functions take the string as `self`. */
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

  const stringToStringType = makeGenericFunctionWithNames(arena, undefined, [], [], [stringType], [], [stringType], /* checked */ true);

  const replArgType = arena.addType(
    unionType([
      stringType,
      arena.addType(tableType({ indexer: new TableIndexer(stringType, stringType), state: TableState.Generic })),
      makeGenericFunctionWithNames(arena, undefined, [], [], [stringType], [], [stringType], /* checked */ false),
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
    /* checked */ false,
  );
  const gmatchFunc = makeGenericFunctionWithNames(
    arena,
    stringType,
    [],
    [],
    [stringType],
    [],
    [arena.addType(functionType(emptyPack, stringVariadicList))],
    /* checked */ true,
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

  // string.byte : string -> number? -> number? -> ...number
  const stringDotByte = functionType(arena.addTypePack([stringType, optionalNumber, optionalNumber]), numberVariadicList);
  stringDotByte.isCheckedFunction = true;

  // string.char : .... number -> string
  const stringDotChar = functionType(numberVariadicList, arena.addTypePack([stringType]));
  stringDotChar.isCheckedFunction = true;

  // string.unpack : string -> string -> number? -> ...any
  const stringDotUnpack = functionType(arena.addTypePack([stringType, stringType, optionalNumber]), variadicTailPack);
  stringDotUnpack.isCheckedFunction = true;

  const stringLib = new Props([
    ["byte", Property.rw(arena.addType(stringDotByte))],
    ["char", Property.rw(arena.addType(stringDotChar))],
    ["find", Property.rw(findFunc)],
    ["format", Property.rw(formatFn)],
    ["gmatch", Property.rw(gmatchFunc)],
    ["gsub", Property.rw(gsubFunc)],
    ["len", Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [], [], [numberType], /* checked */ true))],
    ["lower", Property.rw(stringToStringType)],
    ["match", Property.rw(matchFunc)],
    ["rep", Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [numberType], [], [stringType], /* checked */ true))],
    ["reverse", Property.rw(stringToStringType)],
    [
      "sub",
      Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [numberType, optionalNumber], [], [stringType], /* checked */ true)),
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
          /* checked */ true,
        ),
      ),
    ],
    ["pack", Property.rw(arena.addType(functionType(arena.addTypePack([stringType], variadicTailPack), oneStringPack)))],
    ["packsize", Property.rw(makeGenericFunctionWithNames(arena, stringType, [], [], [], [], [numberType], /* checked */ true))],
    ["unpack", Property.rw(arena.addType(stringDotUnpack))],
  ]);

  assignPropDocumentationSymbols(stringLib, "@luau/global/string");

  const tableTy = arena.addType(tableType({ props: stringLib, state: TableState.Sealed }));

  const ttv = get(tableTy, "TableType");
  if (ttv) ttv.name = "typeof(string)";

  return arena.addType(tableType({ props: new Props([["__index", Property.rw(tableTy)]]), state: TableState.Sealed }));
}

/**
 * C++'s `int(value)` for a double as x86-64 computes it: the value truncated
 * toward zero, or `INT_MIN` for NaN and values out of the range of `int`.
 */
function doubleToInt(value: number): number {
  return value > -2147483649 && value < 2147483648 ? Math.trunc(value) : -2147483648;
}

/**
 * `select` with a constant first argument: `select(n, ...)` returns the
 * arguments from the `n`th on, and `select("#", ...)` returns a number.
 */
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

/** `setmetatable`, whose type the `setmetatable` type function computes. */
class MagicSetMetatable implements MagicFunction {
  infer(_ctx: MagicFunctionCallContext): boolean {
    return false;
  }
}

/** `assert`, whose type the `intersect` type function computes. */
class MagicAssert implements MagicFunction {
  infer(_ctx: MagicFunctionCallContext): boolean {
    return false;
  }
}

/** `table.pack`: the packed table's elements have the union of the argument types. */
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

    // table.pack()         -> {| n: number, [number]: nil |}
    // table.pack(1)        -> {| n: number, [number]: number |}
    // table.pack(1, "foo") -> {| n: number, [number]: number | string |}
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

/** `table.clone` of a table: the result is a shallow copy of the argument's table type. */
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

    const resultType = shallowClone(inputType, arena, /* clonePersistentTypes */ true);

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

/**
 * A read-only copy of a table type, or of the table of a metatable type:
 * sealed, with write-only properties removed and every other property made
 * read-only. Undefined for any other type.
 */
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
    // The copy of the input type becomes the result once it is changed.
    const resultType = shallowClone(inputType, arena, /* clonePersistentTypes */ true);
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

/**
 * `table.freeze` is the identity function bounded by `table`, except that it
 * returns a read-only version of its argument's table type.
 */
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
      // An existing result type that is not blocked means the call does not
      // typestate its argument, so regular inference applies.
      return false;
    }

    const frozenType = freezeTable(inputType, context);

    // Here `resultTy`, when there is one, is blocked, so it can be bound.
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
      // CLI-185019: a variadic tail with no head should be a count mismatch,
      // but the actual count is unknown, so the first type of the tail is
      // checked instead, for a more informative type mismatch.
      firstParamType = first(paramTail);
    }

    if (firstParamType) {
      // The argument must be a table.
      ctx.typechecker.testIsSubtype(follow(firstParamType), ctx.builtinTypes.tableType, callSite.location);
    } else {
      // With no type to check, the whole argument pack is checked, for a type pack mismatch.
      const tableTyPack = ctx.typechecker.module.internalTypes.addTypePack([ctx.typechecker.builtinTypes.tableType]);
      ctx.typechecker.testIsSubtypePack(followPack(ctx.arguments), tableTyPack, callSite.location);
      return true;
    }

    // More than one argument written out is an error too.
    if (paramTypes.length > 1) {
      ctx.typechecker.reportError(
        countMismatch(1, callSite.args.length, CountMismatchContext.Arg, { maximum: 1, isVariadic: false, function: "table.freeze" }),
        callSite.location,
      );
    }

    return true;
  }
}

/**
 * Warns on each `.parent` in a `require` path: `require(foo.parent.bar)`
 * works only through deprecated machinery Luau does not support.
 */
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

/** `require`: the call returns the type of the module its argument resolves to. */
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

// Some builtins are magical enough that their calls are matched by name;
// these matchers keep that logic in one place.

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
