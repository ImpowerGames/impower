// Type errors and their messages, ported from Luau's `Error.h`/`Error.cpp`;
// Luau is MIT-licensed (see `LICENSE-luau.txt`). A diagnostic's code is the
// error's kind, named as Luau names the struct, and its message is the text
// Luau's `toString(TypeError)` produces.

import { binaryOpToString, type BinaryOp } from "./Ast";
import { cloneTypeFun, TypeCloner } from "./Clone";
import type { Location } from "./Location";
import { isIdentifier, toHumanReadableIndex, toString, toStringDetailed, toStringPack } from "./ToString";
import {
  follow,
  flatOptions,
  get,
  getTableType,
  InternalCompilerError,
  PrimitiveKind,
  type BuiltinTypes,
  type TypeArena,
  type TypeFun,
  type TypeId,
  type TypePackId,
} from "./Type";

export const enum TypeMismatchContext {
  CovariantContext,
  InvariantContext,
}

export const enum UnknownSymbolContext {
  Binding,
  Type,
}

export const enum CannotExtendTableContext {
  Property,
  Indexer,
  Metatable,
}

export const enum CountMismatchContext {
  Arg,
  FunctionResult,
  ExprListResult,
  Return,
}

export const enum MissingPropertiesContext {
  Missing,
  Extra,
}

export const enum CannotInferBinaryOperationKind {
  Operation,
  Comparison,
}

export const enum PropertyAccessViolationContext {
  CannotRead,
  CannotWrite,
}

export type TypeErrorData =
  | {
      kind: "TypeMismatch";
      wantedType: TypeId;
      givenType: TypeId;
      context: TypeMismatchContext;
      reason: string;
      error?: LuauTypeError;
    }
  | { kind: "UnknownSymbol"; name: string; context: UnknownSymbolContext }
  | { kind: "UnknownProperty"; table: TypeId; key: string }
  | { kind: "NotATable"; ty: TypeId }
  | { kind: "CannotExtendTable"; tableType: TypeId; context: CannotExtendTableContext; prop: string }
  | { kind: "CannotCompareUnrelatedTypes"; left: TypeId; right: TypeId; op: BinaryOp }
  | { kind: "OnlyTablesCanHaveMethods"; tableType: TypeId }
  | { kind: "DuplicateTypeDefinition"; name: string; previousLocation?: Location }
  | {
      kind: "CountMismatch";
      expected: number;
      maximum?: number;
      actual: number;
      context: CountMismatchContext;
      isVariadic: boolean;
      function: string;
    }
  | { kind: "FunctionDoesNotTakeSelf" }
  | { kind: "FunctionRequiresSelf" }
  | { kind: "OccursCheckFailed" }
  | { kind: "UnknownRequire"; modulePath: string }
  | { kind: "IllegalRequire"; moduleName: string; reason: string }
  | { kind: "IncorrectGenericParameterCount"; name: string; typeFun: TypeFun; actualParameters: number; actualPackParameters: number }
  // `follows` is not part of Luau: the parser's `ParseError.follows`.
  | { kind: "SyntaxError"; message: string; follows?: true }
  | { kind: "CodeTooComplex" }
  | { kind: "UnificationTooComplex" }
  | { kind: "UnknownPropButFoundLikeProp"; table: TypeId; key: string; candidates: string[] }
  | { kind: "GenericError"; message: string }
  | { kind: "InternalError"; message: string }
  | { kind: "ConstraintSolvingIncompleteError" }
  | { kind: "CannotCallNonFunction"; ty: TypeId }
  | { kind: "ExtraInformation"; message: string }
  | { kind: "DeprecatedApiUsed"; symbol: string; useInstead: string }
  | { kind: "FunctionExitsWithoutReturning"; expectedReturnType: TypePackId }
  | {
      kind: "MissingProperties";
      superType: TypeId;
      subType: TypeId;
      properties: string[];
      context: MissingPropertiesContext;
    }
  | { kind: "DuplicateGenericParameter"; parameterName: string }
  | { kind: "CannotAssignToNever"; rhsType: TypeId; cause: TypeId[]; reason: "PropertyNarrowed" }
  | { kind: "CannotInferBinaryOperation"; op: BinaryOp; suggestedToAnnotate?: string; opKind: CannotInferBinaryOperationKind }
  | { kind: "SwappedGenericTypeParameter"; name: string; genericKind: "Type" | "Pack" }
  | { kind: "OptionalValueAccess"; optional: TypeId }
  | { kind: "MissingUnionProperty"; type: TypeId; missing: TypeId[]; key: string }
  | { kind: "TypesAreUnrelated"; left: TypeId; right: TypeId }
  | { kind: "NormalizationTooComplex" }
  | { kind: "TypePackMismatch"; wantedTp: TypePackId; givenTp: TypePackId; reason: string }
  | { kind: "DynamicPropertyLookupOnExternTypesUnsafe"; ty: TypeId }
  | { kind: "UninhabitedTypeFunction"; ty: TypeId }
  | { kind: "UninhabitedTypePackFunction"; tp: TypePackId }
  | { kind: "WhereClauseNeeded"; ty: TypeId }
  | { kind: "PackWhereClauseNeeded"; tp: TypePackId }
  | { kind: "CheckedFunctionCallError"; expected: TypeId; passed: TypeId; checkedFunctionName: string; argumentIndex: number }
  | { kind: "NonStrictFunctionDefinitionError"; functionName: string; argument: string; argumentType: TypeId }
  | { kind: "PropertyAccessViolation"; table: TypeId; key: string; context: PropertyAccessViolationContext }
  | { kind: "CheckedFunctionIncorrectArgs"; functionName: string; expected: number; actual: number }
  | { kind: "UnexpectedTypeInSubtyping"; ty: TypeId }
  | { kind: "UnexpectedTypePackInSubtyping"; tp: TypePackId }
  | { kind: "ExplicitFunctionAnnotationRecommended"; recommendedArgs: [string, TypeId][]; recommendedReturn: TypeId }
  | { kind: "UserDefinedTypeFunctionError"; message: string }
  | { kind: "ReservedIdentifier"; name: string }
  | { kind: "UnexpectedArrayLikeTableItem" }
  | { kind: "CannotCheckDynamicStringFormatCalls" }
  | { kind: "GenericTypeCountMismatch"; subTyGenericCount: number; superTyGenericCount: number }
  | { kind: "GenericTypePackCountMismatch"; subTyGenericPackCount: number; superTyGenericPackCount: number }
  | { kind: "MultipleNonviableOverloads"; attemptedArgCount: number }
  | { kind: "RecursiveRestraintViolation" }
  | { kind: "GenericBoundsMismatch"; genericName: string; lowerBounds: TypeId[]; upperBounds: TypeId[] }
  | { kind: "UnappliedTypeFunction" }
  | { kind: "InstantiateGenericsOnNonFunction"; interestingEdgeCase: "None" | "MetatableCall" | "Intersection" }
  | {
      kind: "TypeInstantiationCountMismatch";
      functionName?: string;
      functionType: TypeId;
      providedTypes: number;
      maximumTypes: number;
      providedTypePacks: number;
      maximumTypePacks: number;
    }
  | { kind: "AmbiguousFunctionCall"; function: TypeId; arguments: TypePackId }
  | { kind: "TypeAnnotationRequired"; inferredTy: TypeId };

export type TypeErrorKind = TypeErrorData["kind"];

// Written as a record so that the compiler rejects a list that leaves a kind
// out or names one `TypeErrorData` lacks.
const ERROR_KINDS: Record<TypeErrorKind, true> = {
  TypeMismatch: true,
  UnknownSymbol: true,
  UnknownProperty: true,
  NotATable: true,
  CannotExtendTable: true,
  CannotCompareUnrelatedTypes: true,
  OnlyTablesCanHaveMethods: true,
  DuplicateTypeDefinition: true,
  CountMismatch: true,
  FunctionDoesNotTakeSelf: true,
  FunctionRequiresSelf: true,
  OccursCheckFailed: true,
  UnknownRequire: true,
  IllegalRequire: true,
  IncorrectGenericParameterCount: true,
  SyntaxError: true,
  CodeTooComplex: true,
  UnificationTooComplex: true,
  UnknownPropButFoundLikeProp: true,
  GenericError: true,
  InternalError: true,
  ConstraintSolvingIncompleteError: true,
  CannotCallNonFunction: true,
  ExtraInformation: true,
  DeprecatedApiUsed: true,
  FunctionExitsWithoutReturning: true,
  MissingProperties: true,
  DuplicateGenericParameter: true,
  CannotAssignToNever: true,
  CannotInferBinaryOperation: true,
  SwappedGenericTypeParameter: true,
  OptionalValueAccess: true,
  MissingUnionProperty: true,
  TypesAreUnrelated: true,
  NormalizationTooComplex: true,
  TypePackMismatch: true,
  DynamicPropertyLookupOnExternTypesUnsafe: true,
  UninhabitedTypeFunction: true,
  UninhabitedTypePackFunction: true,
  WhereClauseNeeded: true,
  PackWhereClauseNeeded: true,
  CheckedFunctionCallError: true,
  NonStrictFunctionDefinitionError: true,
  PropertyAccessViolation: true,
  CheckedFunctionIncorrectArgs: true,
  UnexpectedTypeInSubtyping: true,
  UnexpectedTypePackInSubtyping: true,
  ExplicitFunctionAnnotationRecommended: true,
  UserDefinedTypeFunctionError: true,
  ReservedIdentifier: true,
  UnexpectedArrayLikeTableItem: true,
  CannotCheckDynamicStringFormatCalls: true,
  GenericTypeCountMismatch: true,
  GenericTypePackCountMismatch: true,
  MultipleNonviableOverloads: true,
  RecursiveRestraintViolation: true,
  GenericBoundsMismatch: true,
  UnappliedTypeFunction: true,
  InstantiateGenericsOnNonFunction: true,
  TypeInstantiationCountMismatch: true,
  AmbiguousFunctionCall: true,
  TypeAnnotationRequired: true,
};

/** Every kind of error the checker reports, which is a type diagnostic's `code`. */
export const TYPE_ERROR_KINDS: ReadonlySet<string> = new Set(Object.keys(ERROR_KINDS));

export class LuauTypeError {
  constructor(
    public location: Location,
    public data: TypeErrorData,
    public moduleName = "",
  ) {}

  get kind(): TypeErrorKind {
    return this.data.kind;
  }
}

export function typeMismatch(
  wantedType: TypeId,
  givenType: TypeId,
  options: { reason?: string; error?: LuauTypeError; context?: TypeMismatchContext } = {},
): TypeErrorData {
  return {
    kind: "TypeMismatch",
    wantedType,
    givenType,
    context: options.context ?? TypeMismatchContext.CovariantContext,
    reason: options.reason ?? "",
    error: options.error,
  };
}

export function countMismatch(
  expected: number,
  actual: number,
  context: CountMismatchContext,
  options: { maximum?: number; isVariadic?: boolean; function?: string } = {},
): TypeErrorData {
  return {
    kind: "CountMismatch",
    expected,
    maximum: options.maximum,
    actual,
    context,
    isVariadic: options.isVariadic ?? false,
    function: options.function ?? "",
  };
}

// Luau's `LuauIndentTypeMismatchMaxTypeLength`.
const INDENT_TYPE_MISMATCH_MAX_TYPE_LENGTH = 10;

function wrongNumberOfArgsString(
  expectedCount: number,
  maximumCount: number | undefined,
  actualCount: number,
  argPrefix?: string,
  isVariadic = false,
): string {
  let s = "expects ";
  if (isVariadic) s += "at least ";
  s += `${expectedCount} `;
  if (maximumCount !== undefined && expectedCount !== maximumCount) s += `to ${maximumCount} `;
  if (argPrefix) s += `${argPrefix} `;
  s += "argument";
  if ((maximumCount ?? expectedCount) !== 1) s += "s";
  s += ", but ";
  if (actualCount === 0) s += "none";
  else {
    if (actualCount < expectedCount) s += "only ";
    s += String(actualCount);
  }
  s += actualCount === 1 ? " is" : " are";
  s += " specified";
  return s;
}

const BINARY_OPS: Record<string, string> = {
  add: "+",
  sub: "-",
  mul: "*",
  div: "/",
  idiv: "//",
  pow: "^",
  mod: "%",
  concat: "..",
  lt: "< or >=",
  le: "<= or >",
  eq: "== or ~=",
};

const UNARY_OPS: Record<string, string> = { unm: "-", len: "#", not: "not" };

// These type functions always reduce, so their failing is a bug in Luau.
const UNREACHABLE_TYPE_FUNCTIONS = new Set(["refine", "singleton", "union", "intersect", "and", "or"]);

function definitionModuleName(ty: TypeId): string | undefined {
  const t = follow(ty);
  const ttv = get(t, "TableType");
  if (ttv) return ttv.definitionModuleName || undefined;
  const ftv = get(t, "FunctionType");
  if (ftv) return ftv.definition?.definitionModuleName;
  const etv = get(t, "ExternType");
  if (etv) return etv.definitionModuleName || undefined;
  return undefined;
}

function findCallMetamethod(type: TypeId): TypeId | undefined {
  type = follow(type);
  const metatable = get(type, "MetatableType")?.metatable ?? get(type, "ExternType")?.metatable;
  if (!metatable) return undefined;
  const unwrapped = follow(metatable);
  if (get(unwrapped, "AnyType")) return unwrapped;
  return getTableType(unwrapped)?.props.get("__call")?.readTy;
}

/** The message Luau's `toString(TypeError)` gives an error. */
export function errorToString(error: LuauTypeError): string {
  const e = error.data;
  switch (e.kind) {
    case "TypeMismatch": {
      const givenTypeName = toString(e.givenType);
      const wantedTypeName = toString(e.wantedType);
      const quote = (s: string) => `'${s}'`;
      const construct = (givenType: string, wantedType: string, givenModule?: string, wantedModule?: string) => {
        const given = givenModule ? `${quote(givenType)} from ${quote(givenModule)}` : quote(givenType);
        const wanted = wantedModule ? `${quote(wantedType)} from ${quote(wantedModule)}` : quote(wantedType);
        if (get(follow(e.wantedType), "NeverType")) {
          if (givenType.length <= INDENT_TYPE_MISMATCH_MAX_TYPE_LENGTH) return `Expected this to be unreachable, but got ${given}`;
          return `Expected this to be unreachable, but got\n\t${given}`;
        }
        const short = givenType.length <= INDENT_TYPE_MISMATCH_MAX_TYPE_LENGTH || wantedType.length <= INDENT_TYPE_MISMATCH_MAX_TYPE_LENGTH;
        if (e.context === TypeMismatchContext.InvariantContext) {
          if (short) return `Expected this to be exactly ${wanted}, but got ${given}`;
          return `Expected this to be exactly\n\t${wanted}\nbut got\n\t${given}`;
        }
        if (short) return `Expected this to be ${wanted}, but got ${given}`;
        return `Expected this to be\n\t${wanted}\nbut got\n\t${given}`;
      };
      let result = "";
      if (givenTypeName === wantedTypeName) {
        const givenModule = definitionModuleName(e.givenType);
        const wantedModule = definitionModuleName(e.wantedType);
        if (givenModule !== undefined && wantedModule !== undefined) {
          result = construct(givenTypeName, wantedTypeName, givenModule, wantedModule);
        }
      }
      if (!result) result = construct(givenTypeName, wantedTypeName);
      if (e.error) {
        result += "\ncaused by:\n  ";
        if (e.reason) result += `${e.reason}\n`;
        result += errorToString(e.error);
      } else if (e.reason) {
        result += `; ${e.reason}`;
      }
      return result;
    }
    case "UnknownSymbol":
      return e.context === UnknownSymbolContext.Binding
        ? `Unknown global '${e.name}'; consider assigning to it first`
        : `Unknown type '${e.name}'`;
    case "UnknownProperty": {
      const t = follow(e.table);
      if (get(t, "TableType")) return `Key '${e.key}' not found in table '${toString(t)}'`;
      if (get(t, "ExternType")) return `Key '${e.key}' not found in external type '${toString(t)}'`;
      return `Type '${toString(e.table)}' does not have key '${e.key}'`;
    }
    case "NotATable":
      return `Expected type table, got '${toString(e.ty)}' instead`;
    case "CannotExtendTable":
      switch (e.context) {
        case CannotExtendTableContext.Property:
          return `Cannot add property '${e.prop}' to table '${toString(e.tableType)}'`;
        case CannotExtendTableContext.Metatable:
          return `Cannot add metatable to table '${toString(e.tableType)}'`;
        case CannotExtendTableContext.Indexer:
          return `Cannot add indexer to table '${toString(e.tableType)}'`;
      }
      return "";
    case "CannotCompareUnrelatedTypes":
      return `Cannot compare unrelated types '${toString(e.left)}' and '${toString(e.right)}' with '${binaryOpToString(e.op)}'`;
    case "OnlyTablesCanHaveMethods":
      return `Cannot add method to non-table type '${toString(e.tableType)}'`;
    case "DuplicateTypeDefinition": {
      let s = `Redefinition of type '${e.name}'`;
      if (e.previousLocation) s += `, previously defined at line ${e.previousLocation.begin.line + 1}`;
      return s;
    }
    case "CountMismatch": {
      const expectedS = e.expected === 1 ? "" : "s";
      const actualVerb = e.actual === 1 ? "is" : "are";
      switch (e.context) {
        case CountMismatchContext.Return:
          return `Expected to return ${e.expected} value${expectedS}, but ${e.actual} ${actualVerb} returned here`;
        case CountMismatchContext.FunctionResult:
          return `Function only returns ${e.expected} value${expectedS}, but ${e.actual} ${actualVerb} required here`;
        case CountMismatchContext.ExprListResult:
          return `Expression list has ${e.expected} value${expectedS}, but ${e.actual} ${actualVerb} required here`;
        case CountMismatchContext.Arg:
          if (e.function) {
            return `Argument count mismatch. Function '${e.function}' ${wrongNumberOfArgsString(e.expected, e.maximum, e.actual, undefined, e.isVariadic)}`;
          }
          return `Argument count mismatch. Function ${wrongNumberOfArgsString(e.expected, e.maximum, e.actual, undefined, e.isVariadic)}`;
      }
      return "";
    }
    case "FunctionDoesNotTakeSelf":
      return "This function does not take self. Did you mean to use a dot instead of a colon?";
    case "FunctionRequiresSelf":
      return "This function must be called with self. Did you mean to use a colon instead of a dot?";
    case "OccursCheckFailed":
      return "Type contains a self-recursive construct that cannot be resolved";
    case "UnknownRequire":
      return e.modulePath ? `Unknown require: ${e.modulePath}` : "Unknown require: unsupported path";
    case "IllegalRequire":
      return `Cannot require module ${e.moduleName}: ${e.reason}`;
    case "IncorrectGenericParameterCount": {
      let name = e.name;
      const tf = e.typeFun;
      if (tf.typeParams.length || tf.typePackParams.length) {
        name += `<${[...tf.typeParams.map((p) => toString(p.ty)), ...tf.typePackParams.map((p) => toStringPack(p.tp))].join(", ")}>`;
      }
      if (tf.typeParams.length !== e.actualParameters) {
        return `Generic type '${name}' ${wrongNumberOfArgsString(tf.typeParams.length, undefined, e.actualParameters, "type", tf.typePackParams.length > 0)}`;
      }
      return `Generic type '${name}' ${wrongNumberOfArgsString(tf.typePackParams.length, undefined, e.actualPackParameters, "type pack", false)}`;
    }
    case "SyntaxError":
      return e.message;
    case "CodeTooComplex":
      return "Code is too complex to typecheck! Consider simplifying the code around this area";
    case "UnificationTooComplex":
      return "Internal error: Code is too complex to typecheck! Consider adding type annotations around this area";
    case "UnknownPropButFoundLikeProp": {
      let suggestion = "Did you mean ";
      if (e.candidates.length !== 1) suggestion += "one of ";
      suggestion += e.candidates.map((c) => `'${c}'`).join(", ");
      const t = follow(e.table);
      return `Key '${e.key}' not found in ${get(t, "ExternType") ? "external type" : "table"} '${toString(e.table)}'.  ${suggestion}?`;
    }
    case "GenericError":
    case "InternalError":
    case "ExtraInformation":
    case "UserDefinedTypeFunctionError":
      return e.message;
    case "ConstraintSolvingIncompleteError":
      return "Type inference failed to complete, you may see some confusing types and type errors.";
    case "CannotCallNonFunction": {
      const unionTy = get(follow(e.ty), "UnionType");
      if (unionTy) {
        let err = "Cannot call a value of the union type:";
        for (let option of flatOptions(unionTy)) {
          option = follow(option);
          if (get(option, "FunctionType") || findCallMetamethod(option)) {
            err += `\n  | ${toString(option)}`;
            continue;
          }
          return `Cannot call a value of type ${toString(option)} in union:\n  ${toString(e.ty)}`;
        }
        return `${err}\nWe are unable to determine the appropriate result type for such a call.`;
      }
      const prim = get(follow(e.ty), "PrimitiveType");
      if (prim && prim.type === PrimitiveKind.Function) {
        return `The type ${toString(e.ty)} is not precise enough for us to determine the appropriate result type of this call.`;
      }
      return `Cannot call a value of type ${toString(e.ty)}`;
    }
    case "DeprecatedApiUsed":
      return `The property .${e.symbol} is deprecated.  Use .${e.useInstead} instead.`;
    case "FunctionExitsWithoutReturning":
      return `Not all codepaths in this function return '${toStringPack(e.expectedReturnType)}'.`;
    case "MissingProperties": {
      let s = `Table type '${toString(e.subType)}' not compatible with type '${toString(e.superType)}' because the former`;
      s += e.context === MissingPropertiesContext.Missing ? " is missing field" : " has extra field";
      if (e.properties.length > 1) s += "s";
      s += " ";
      e.properties.forEach((p, i) => {
        if (i > 0) s += ", ";
        if (i > 0 && i === e.properties.length - 1) s += "and ";
        s += `'${p}'`;
      });
      return s;
    }
    case "DuplicateGenericParameter":
      return `Duplicate type parameter '${e.parameterName}'`;
    case "CannotInferBinaryOperation": {
      let ss = `Unknown type used in ${binaryOpToString(e.op)}`;
      ss += e.opKind === CannotInferBinaryOperationKind.Comparison ? " comparison" : " operation";
      if (e.suggestedToAnnotate) ss += `; consider adding a type annotation to '${e.suggestedToAnnotate}'`;
      return ss;
    }
    case "SwappedGenericTypeParameter":
      return e.genericKind === "Type"
        ? `Variadic type parameter '${e.name}...' is used as a regular generic type; consider changing '${e.name}...' to '${e.name}' in the generic argument list`
        : `Generic type '${e.name}' is used as a variadic type parameter; consider changing '${e.name}' to '${e.name}...' in the generic argument list`;
    case "OptionalValueAccess":
      return `Value of type '${toString(e.optional)}' could be nil`;
    case "MissingUnionProperty":
      return `Key '${e.key}' is missing from ${e.missing.map((t) => `'${toString(t)}'`).join(", ")} in the type '${toString(e.type)}'`;
    case "TypesAreUnrelated":
      return `Cannot cast '${toString(e.left)}' into '${toString(e.right)}' because the types are unrelated`;
    case "NormalizationTooComplex":
      return "Code is too complex to typecheck! Consider simplifying the code around this area";
    case "TypePackMismatch": {
      let ss = `Expected this to be '${toStringPack(e.wantedTp)}', but got '${toStringPack(e.givenTp)}'`;
      if (e.reason) ss += `; ${e.reason}`;
      return ss;
    }
    case "DynamicPropertyLookupOnExternTypesUnsafe":
      return `Attempting a dynamic property access on type '${toString(e.ty)}' is unsafe and may cause exceptions at runtime`;
    case "UninhabitedTypeFunction":
      return uninhabitedTypeFunctionMessage(e.ty);
    case "ExplicitFunctionAnnotationRecommended": {
      const toReturn = toString(e.recommendedReturn);
      const argAnnotations = e.recommendedArgs.map(([arg, type]) => `${arg}: ${toString(type)}`).join(", ");
      if (!argAnnotations) return `Consider annotating the return with ${toReturn}`;
      return `Consider placing the following annotations on the arguments: ${argAnnotations} or instead annotating the return as ${toReturn}`;
    }
    case "UninhabitedTypePackFunction":
      return `Type pack function instance ${toStringPack(e.tp)} is uninhabited`;
    case "WhereClauseNeeded":
      return `Type function instance ${toString(e.ty)} depends on generic function parameters but does not appear in the function signature; this construct cannot be type-checked at this time`;
    case "PackWhereClauseNeeded":
      return `Type pack function instance ${toStringPack(e.tp)} depends on generic function parameters but does not appear in the function signature; this construct cannot be type-checked at this time`;
    case "CheckedFunctionCallError":
      return `the function '${e.checkedFunctionName}' expects to get a ${toString(e.expected)} as its ${toHumanReadableIndex(e.argumentIndex)} argument, but is being given a ${toString(e.passed)}`;
    case "NonStrictFunctionDefinitionError": {
      const prefix = e.functionName ? `in the function '${e.functionName}', '` : "";
      return `${prefix}the argument '${e.argument}' is used in a way that will error at runtime`;
    }
    case "PropertyAccessViolation": {
      const stringKey = isIdentifier(e.key) ? e.key : `"${e.key}"`;
      const kind = getTableType(e.table) ? "table" : "type";
      return e.context === PropertyAccessViolationContext.CannotRead
        ? `Property ${stringKey} of ${kind} '${toString(e.table)}' is write-only`
        : `Property ${stringKey} of ${kind} '${toString(e.table)}' is read-only`;
    }
    case "CheckedFunctionIncorrectArgs":
      return `the function '${e.functionName}' will error at runtime if it is not called with ${e.expected} arguments, but we are calling it here with ${e.actual} arguments`;
    case "UnexpectedTypeInSubtyping":
      return `Encountered an unexpected type in subtyping: ${toString(e.ty)}`;
    case "UnexpectedTypePackInSubtyping":
      return `Encountered an unexpected type pack in subtyping: ${toStringPack(e.tp)}`;
    case "ReservedIdentifier":
      return `${e.name} cannot be used as an identifier for a type function or alias`;
    case "CannotAssignToNever": {
      let result = `Cannot assign a value of type ${toString(e.rhsType)} to a field of type never`;
      if (e.cause.length) {
        result += "\ncaused by the property being given the following incompatible types:\n";
        for (const ty of e.cause) result += `    ${toString(ty)}\n`;
        result += "There are no values that could safely satisfy all of these types at once.";
      }
      return result;
    }
    case "UnexpectedArrayLikeTableItem":
      return "Unexpected array-like table item: the indexer key type of this table is not `number`.";
    case "CannotCheckDynamicStringFormatCalls":
      return "We cannot statically check the type of `string.format` when called with a format string that is not statically known.\nIf you'd like to use an unchecked `string.format` call, you can cast the format string to `any` using `:: any`.";
    case "GenericTypeCountMismatch":
      return `Different number of generic type parameters: subtype had ${e.subTyGenericCount}, supertype had ${e.superTyGenericCount}.`;
    case "GenericTypePackCountMismatch":
      return `Different number of generic type pack parameters: subtype had ${e.subTyGenericPackCount}, supertype had ${e.superTyGenericPackCount}.`;
    case "MultipleNonviableOverloads":
      return `None of the overloads for function that accept ${e.attemptedArgCount} arguments are compatible.`;
    case "RecursiveRestraintViolation":
      return "Recursive type being used with different parameters.";
    case "GenericBoundsMismatch":
      return `No valid instantiation could be inferred for generic type parameter ${e.genericName}. It was expected to be at least:\n\t${e.lowerBounds
        .map((t) => toString(t))
        .join(" | ")}\nand at most:\n\t${e.upperBounds.map((t) => toString(t)).join(" & ")}\nbut these types are not compatible with one another.`;
    case "UnappliedTypeFunction":
      return "Type functions always require `<>` when referenced.";
    case "InstantiateGenericsOnNonFunction":
      switch (e.interestingEdgeCase) {
        case "None":
          return "Cannot instantiate type parameters on something without type parameters.";
        case "MetatableCall":
          return "Luau does not currently support explicitly instantiating a table with a `__call` metamethod.                 You may be able to work around this by creating a function that calls the table, and using that instead.";
        case "Intersection":
          return "Luau does not currently support explicitly instantiating an overloaded function type.";
      }
      return "";
    case "TypeInstantiationCountMismatch": {
      let result = "Too many type parameters passed to ";
      result += e.functionName ? `'${e.functionName}', which is typed as ` : "function typed as ";
      result += `${toString(e.functionType)}. Expected `;
      if (e.providedTypes > e.maximumTypes) {
        result += `at most ${e.maximumTypes} type parameter${e.maximumTypes !== 1 ? "s" : ""}, but ${e.providedTypes} provided`;
        if (e.providedTypePacks > e.maximumTypePacks) result += ". Also expected ";
      }
      if (e.providedTypePacks > e.maximumTypePacks) {
        result += `at most ${e.maximumTypePacks} type pack${e.maximumTypePacks !== 1 ? "s" : ""}, but ${e.providedTypePacks} provided`;
      }
      return `${result}.`;
    }
    case "AmbiguousFunctionCall":
      return `Calling function ${toString(e.function)} with argument pack ${toStringPack(e.arguments)} is ambiguous.`;
    case "TypeAnnotationRequired": {
      const tos = toStringDetailed(e.inferredTy, { functionTypeArguments: true, ignoreSyntheticName: true });
      if (!tos.invalid && !tos.truncated && !tos.error) return `Type annotation required here.  Consider ${tos.name}`;
      return "Type annotation required here.  Unable to infer the type of this function.";
    }
  }
}

function uninhabitedTypeFunctionMessage(ty: TypeId): string {
  const tfit = get(ty, "TypeFunctionInstanceType");
  if (!tfit) return `Internal error: Unexpected type ${toString(ty)} flagged as an uninhabited type function.`;
  const name = tfit.function.name;
  const unary = UNARY_OPS[name];
  if (unary) {
    let result = `Operator '${unary}' could not be applied to `;
    if (tfit.typeArguments.length === 1 && tfit.packArguments.length === 0) {
      result += `operand of type ${toString(tfit.typeArguments[0]!)}`;
      if (name !== "not") result += `; there is no corresponding overload for __${name}`;
    } else {
      result += `operands of types ${tfit.typeArguments.map((t) => toString(t)).join(", ")}`;
      for (const p of tfit.packArguments) result += `, ${toStringPack(p)}`;
    }
    return result;
  }
  const binary = BINARY_OPS[name];
  if (binary) {
    let result = `Operator '${binary}' could not be applied to operands of types `;
    if (tfit.typeArguments.length === 2 && tfit.packArguments.length === 0) {
      result += `${toString(tfit.typeArguments[0]!)} and ${toString(tfit.typeArguments[1]!)}`;
    } else {
      result += tfit.typeArguments.map((t) => toString(t)).join(", ");
      for (const p of tfit.packArguments) result += `, ${toStringPack(p)}`;
    }
    return `${result}; there is no corresponding overload for __${name}`;
  }
  if (name === "keyof" || name === "rawkeyof") {
    if (tfit.typeArguments.length === 1 && tfit.packArguments.length === 0) {
      return `Type '${toString(tfit.typeArguments[0]!)}' does not have keys, so '${toString(ty)}' is invalid`;
    }
    return `Type function instance ${toString(ty)} is ill-formed, and thus invalid`;
  }
  if (name === "index" || name === "rawget") {
    if (tfit.typeArguments.length !== 2) return `Type function instance ${toString(ty)} is ill-formed, and thus invalid`;
    if (get(tfit.typeArguments[1], "ErrorType")) {
      return `Second argument to ${name}<${toString(tfit.typeArguments[0]!)}, _> is not a valid index type`;
    }
    return `Property '${toString(tfit.typeArguments[1]!)}' does not exist on type '${toString(tfit.typeArguments[0]!)}'`;
  }
  if (UNREACHABLE_TYPE_FUNCTIONS.has(name)) {
    return `Type function instance ${toString(ty)} is uninhabited\nThis is likely to be a bug, please report it at https://github.com/luau-lang/luau/issues`;
  }
  return `Type function instance ${toString(ty)} is uninhabited`;
}

const ENUM_NAMES: Record<string, Record<number, string>> = {
  TypeMismatch: { 0: "CovariantContext", 1: "InvariantContext" },
  UnknownSymbol: { 0: "Binding", 1: "Type" },
  CannotExtendTable: { 0: "Property", 1: "Indexer", 2: "Metatable" },
  CountMismatch: { 0: "Arg", 1: "FunctionResult", 2: "ExprListResult", 3: "Return" },
  MissingProperties: { 0: "Missing", 1: "Extra" },
  PropertyAccessViolation: { 0: "CannotRead", 1: "CannotWrite" },
};

/**
 * An error's fields, named as Luau's struct names them, with types and packs
 * printed and enumerations named, for tests and for a diagnostic's data.
 */
export function errorFields(error: LuauTypeError): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const enums = ENUM_NAMES[error.data.kind];
  for (const [key, value] of Object.entries(error.data)) {
    if (key === "kind") continue;
    out[key] = printField(key, value, enums);
  }
  return out;
}

function printField(key: string, value: unknown, enums: Record<number, string> | undefined): unknown {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map((v) => printField(key, v, undefined));
  if (typeof value === "object") {
    if (value instanceof LuauTypeError) return errorFields(value);
    const kind = (value as { ty?: { kind?: string } }).ty?.kind;
    if (kind !== undefined) {
      return kind.endsWith("TypePack") || kind === "TypePack" ? toStringPack(value as TypePackId) : toString(value as TypeId);
    }
    return value;
  }
  if (typeof value === "number" && enums && key === "context") return enums[value] ?? value;
  if (typeof value === "string" && key === "name") return value;
  return value;
}

// ---------------------------------------------------------------------------
// Copying errors (Luau's `copyErrors`, from `Error.cpp`)
// ---------------------------------------------------------------------------

/** Clones the types the errors refer to into `destArena`, so that the errors never point into the module's internal types. */
export function copyErrors(errors: LuauTypeError[], destArena: TypeArena, builtinTypes: BuiltinTypes): void {
  // The cloner's maps from original types to clones stand for Luau's `CloneState`.
  const cloneState = new TypeCloner(destArena, builtinTypes);

  // Each error owns its data in Luau, so each gets a copy with its types
  // cloned; a nested error is shared, as Luau's `shared_ptr` shares it.
  for (const error of errors) error.data = copyError(error.data, cloneState);
}

/** A copy of an error's data with its types cloned; a nested error is copied in place. */
function copyError(e: TypeErrorData, cloneState: TypeCloner): TypeErrorData {
  const clone = (ty: TypeId): TypeId => cloneState.clone(ty);
  const clonePack = (tp: TypePackId): TypePackId => cloneState.clonePack(tp);

  switch (e.kind) {
    case "TypeMismatch": {
      const copy = { ...e, wantedType: clone(e.wantedType), givenType: clone(e.givenType) };

      if (e.error) e.error.data = copyError(e.error.data, cloneState);
      return copy;
    }
    case "UnknownSymbol":
      return e;
    case "UnknownProperty":
      return { ...e, table: clone(e.table) };
    case "NotATable":
      return { ...e, ty: clone(e.ty) };
    case "CannotExtendTable":
      return { ...e, tableType: clone(e.tableType) };
    case "CannotCompareUnrelatedTypes":
      return { ...e, left: clone(e.left), right: clone(e.right) };
    case "OnlyTablesCanHaveMethods":
      return { ...e, tableType: clone(e.tableType) };
    case "DuplicateTypeDefinition":
    case "CountMismatch":
    case "FunctionDoesNotTakeSelf":
    case "FunctionRequiresSelf":
    case "OccursCheckFailed":
    case "UnknownRequire":
    case "IllegalRequire":
      return e;
    case "IncorrectGenericParameterCount":
      return { ...e, typeFun: cloneTypeFun(e.typeFun, cloneState) };
    case "SyntaxError":
    case "CodeTooComplex":
    case "UnificationTooComplex":
      return e;
    case "UnknownPropButFoundLikeProp":
      return { ...e, table: clone(e.table) };
    case "GenericError":
    case "InternalError":
    case "ConstraintSolvingIncompleteError":
      return e;
    case "CannotCallNonFunction":
      return { ...e, ty: clone(e.ty) };
    case "ExtraInformation":
    case "DeprecatedApiUsed":
      return e;
    case "FunctionExitsWithoutReturning":
      return { ...e, expectedReturnType: clonePack(e.expectedReturnType) };
    case "DuplicateGenericParameter":
    case "CannotInferBinaryOperation":
      return e;
    case "MissingProperties":
      return { ...e, superType: clone(e.superType), subType: clone(e.subType) };
    case "SwappedGenericTypeParameter":
      return e;
    case "OptionalValueAccess":
      return { ...e, optional: clone(e.optional) };
    case "MissingUnionProperty":
      return { ...e, type: clone(e.type), missing: e.missing.map(clone) };
    case "TypesAreUnrelated":
      return { ...e, left: clone(e.left), right: clone(e.right) };
    case "NormalizationTooComplex":
      return e;
    case "TypePackMismatch":
      return { ...e, wantedTp: clonePack(e.wantedTp), givenTp: clonePack(e.givenTp) };
    case "DynamicPropertyLookupOnExternTypesUnsafe":
      return { ...e, ty: clone(e.ty) };
    case "UninhabitedTypeFunction":
      return { ...e, ty: clone(e.ty) };
    case "ExplicitFunctionAnnotationRecommended":
      return {
        ...e,
        recommendedReturn: clone(e.recommendedReturn),
        recommendedArgs: e.recommendedArgs.map(([name, t]): [string, TypeId] => [name, clone(t)]),
      };
    case "UninhabitedTypePackFunction":
      return { ...e, tp: clonePack(e.tp) };
    case "WhereClauseNeeded":
      return { ...e, ty: clone(e.ty) };
    case "PackWhereClauseNeeded":
      return { ...e, tp: clonePack(e.tp) };
    case "CheckedFunctionCallError":
      return { ...e, expected: clone(e.expected), passed: clone(e.passed) };
    case "NonStrictFunctionDefinitionError":
      return { ...e, argumentType: clone(e.argumentType) };
    case "PropertyAccessViolation":
      return { ...e, table: clone(e.table) };
    case "CheckedFunctionIncorrectArgs":
      return e;
    case "UnexpectedTypeInSubtyping":
      return { ...e, ty: clone(e.ty) };
    case "UnexpectedTypePackInSubtyping":
      return { ...e, tp: clonePack(e.tp) };
    case "UserDefinedTypeFunctionError":
      return e;
    case "CannotAssignToNever":
      return { ...e, rhsType: clone(e.rhsType), cause: e.cause.map(clone) };
    case "UnexpectedArrayLikeTableItem":
    case "ReservedIdentifier":
    case "CannotCheckDynamicStringFormatCalls":
    case "GenericTypeCountMismatch":
    case "GenericTypePackCountMismatch":
    case "MultipleNonviableOverloads":
    case "RecursiveRestraintViolation":
      return e;
    case "GenericBoundsMismatch":
      return { ...e, lowerBounds: e.lowerBounds.map(clone), upperBounds: e.upperBounds.map(clone) };
    case "InstantiateGenericsOnNonFunction":
      return e;
    case "TypeInstantiationCountMismatch":
      return { ...e, functionType: clone(e.functionType) };
    case "UnappliedTypeFunction":
      return e;
    case "AmbiguousFunctionCall":
      return { ...e, function: clone(e.function), arguments: clonePack(e.arguments) };
    case "TypeAnnotationRequired":
      return { ...e, inferredTy: clone(e.inferredTy) };
    default: {
      // Every kind is listed above, as the `static_assert` on Luau's switch requires.
      const unhandled: never = e;
      throw new InternalCompilerError(`Non-exhaustive type switch: ${(unhandled as TypeErrorData).kind}`);
    }
  }
}
