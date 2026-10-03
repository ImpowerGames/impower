import {
  AstLocal,
  AstNode,
  AstExprTable,
  AstTypeTable,
  AstTypeReference,
  AstTypeFunction,
  AstTypePackExplicit,
  AstGenericType,
  AstGenericTypePack,
  AstStatIf,
  AstExprGlobal,
  AstStatFor,
  AstStatCompoundAssign,
  AstStatTypeAlias,
  AstTypeGroup,
  AstExprUnary,
  AstExprBinary,
  AstStatDeclareExternType,
  AstStatDeclareGlobal,
  AstStatDeclareFunction,
} from "../../compiler/typecheck/Ast";
import { Location } from "../../compiler/typecheck/Location";
import type { AstSubstitution } from "../../compiler/typecheck/printAst";
import type { Json } from "./officialLuau";

// The fields written by Analysis/src/AstJsonEncoder.cpp at the conformance pin.
// Omitted fields here are absent upstream, not comparison exemptions.
const fields: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    ExprGroup: "expr",
    ExprConstantNil: "",
    ExprConstantBool: "value",
    ExprConstantNumber: "value",
    ExprConstantString: "value",
    ExprLocal: "local",
    ExprGlobal: "global",
    ExprVarargs: "",
    ExprCall: "func args self argLocation",
    ExprIndexName: "expr index indexLocation op",
    ExprIndexExpr: "expr index",
    ExprFunction:
      "attributes generics genericPacks self args returnAnnotation vararg varargLocation varargAnnotation body functionDepth debugname",
    ExprIfElse: "condition hasThen trueExpr hasElse falseExpr",
    ExprInterpString: "strings expressions",
    ExprTable: "items",
    ExprUnary: "op expr",
    ExprBinary: "op left right",
    ExprTypeAssertion: "expr annotation",
    ExprError: "expressions messageIndex",
    StatBlock: "hasEnd body",
    StatIf: "condition thenbody elsebody hasThen",
    StatWhile: "condition body hasDo",
    StatRepeat: "condition body",
    StatBreak: "",
    StatContinue: "",
    StatReturn: "list",
    StatExpr: "expr",
    StatLocal: "vars values",
    StatFor: "var from to step body hasDo",
    StatForIn: "vars values body hasIn hasDo",
    StatAssign: "vars values",
    StatCompoundAssign: "op var value",
    StatFunction: "name func",
    StatLocalFunction: "name func",
    StatTypeAlias: "name nameLocation generics genericPacks value exported",
    StatDeclareGlobal: "name nameLocation luauType",
    StatDeclareFunction: "attributes name nameLocation params paramNames vararg varargLocation retTypes generics genericPacks",
    StatDeclareExternType: "name superName props indexer",
    StatError: "expressions statements",
    TypeReference: "prefix prefixLocation name nameLocation parameters hasParameterList",
    TypeTable: "props indexer",
    TypeFunction:
      "attributes generics genericPacks argTypes argNames returnTypes",
    TypeTypeof: "expr",
    TypeOptional: "",
    TypeUnion: "types",
    TypeIntersection: "types",
    TypeError: "types messageIndex",
    TypeGroup: "inner",
    TypeSingletonBool: "value",
    TypeSingletonString: "value",
    TypePackExplicit: "typeList",
    TypePackVariadic: "variadicType",
    TypePackGeneric: "genericName",
    ExprInstantiate: "expr typeArguments",
    StatTypeFunction: "name nameLocation body exported hasErrors",
    Attr: "name args",
  }).map(([kind, names]) => [kind, names ? names.split(" ") : []]),
);
const binaryNames =
  "Add Sub Mul Div FloorDiv Mod Pow Concat CompareNe CompareEq CompareLt CompareLe CompareGt CompareGe And Or".split(
    " ",
  );

/** The official encoder's shape, with the converter's document coordinates. */
export function printOfficialAst(
  root: AstNode,
  substitute?: AstSubstitution,
): Json {
  function encode(value: unknown): Json {
    if (value === undefined || value === null) return null;
    if (typeof value === "number" && !Number.isFinite(value))
      return String(value);
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number"
    )
      return value;
    if (value instanceof Location)
      return `${value.begin.line},${value.begin.column} - ${value.end.line},${value.end.column}`;
    if (Array.isArray(value))
      return value.flatMap((item) => {
        const replacement =
          item instanceof AstNode ? substitute?.(item) : undefined;
        return Array.isArray(replacement)
          ? replacement.map(encode)
          : [encode(replacement ?? item)];
      });
    if (value instanceof AstLocal)
      return {
        type: "AstLocal",
        name: value.name,
        location: encode(value.location),
        luauType: encode(value.annotation),
        isConst: value.isConst,
      };
    if (value instanceof AstNode) {
      const replacement = substitute?.(value);
      if (replacement !== undefined) return encode(replacement);
      if (
        value instanceof AstGenericType ||
        value instanceof AstGenericTypePack
      )
        return {
          type: `Ast${value.kind}`,
          name: value.name,
          ...(value.defaultValue
            ? { luauType: encode(value.defaultValue) }
            : {}),
        };
      const names = fields[value.kind];
      if (!names)
        throw new Error(`Official JSON printer does not support ${value.kind}`);
      const properties = { ...value } as Record<string, unknown>;
      if (value instanceof AstExprGlobal) properties["global"] = value.name;
      if (value instanceof AstStatIf)
        properties["hasThen"] = value.thenLocation !== undefined;
      if (value instanceof AstStatFor || value instanceof AstStatCompoundAssign)
        properties["var"] = value.variable;
      if (value instanceof AstStatTypeAlias) properties["value"] = value.type;
      if (value instanceof AstStatDeclareGlobal) properties["luauType"] = value.type;
      if (value instanceof AstTypeGroup) properties["inner"] = value.type;
      if (value instanceof AstExprUnary)
        properties["op"] = ["Not", "Minus", "Len"][value.op];
      if (
        value instanceof AstExprBinary ||
        value instanceof AstStatCompoundAssign
      )
        properties["op"] = binaryNames[value.op];
      if (value instanceof AstExprTable)
        properties["items"] = value.items.map((item) => ({
          type: "AstExprTableItem",
          kind: ["item", "record", "general"][item.kind],
          ...(item.key ? { key: item.key } : {}),
          value: item.value,
        }));
      if (value instanceof AstTypeReference)
        properties["parameters"] = value.parameters.map(
          (p) => p.type ?? p.typePack,
        );
      if (value.kind === "ExprInstantiate")
        properties["typeArguments"] = (
          properties["typeArguments"] as {
            type?: unknown;
            typePack?: unknown;
          }[]
        ).map((p) => p.type ?? p.typePack);
      if (value instanceof AstTypeTable) {
        properties["props"] = value.props.map((p) => ({
          type: "AstTableProp",
          name: p.name,
          location: p.location,
          propType: p.type,
          access: p.access,
          ...(p.accessLocation ? { accessLocation: p.accessLocation } : {}),
        }));
        properties["indexer"] = value.indexer
          ? {
              location: value.indexer.location,
              indexType: value.indexer.indexType,
              resultType: value.indexer.resultType,
              access: value.indexer.access,
              ...(value.indexer.accessLocation ? { accessLocation: value.indexer.accessLocation } : {}),
            }
          : null;
      }
      if (value instanceof AstStatDeclareExternType) {
        properties["props"] = value.props.map((p) => ({
          type: "AstDeclaredClassProp", name: p.name, nameLocation: p.nameLocation,
          luauType: p.ty, location: p.location, access: p.access, isMethod: p.isMethod,
        }));
        properties["indexer"] = value.indexer ? {
          location: value.indexer.location, indexType: value.indexer.indexType,
          resultType: value.indexer.resultType, access: value.indexer.access,
          ...(value.indexer.accessLocation ? { accessLocation: value.indexer.accessLocation } : {}),
        } : null;
      }
      const typeList = (list: { types: unknown[]; tailType?: unknown }) => ({
        type: "AstTypeList",
        types: list.types,
        ...(list.tailType ? { tailType: list.tailType } : {}),
      });
      if (value instanceof AstTypePackExplicit)
        properties["typeList"] = typeList(value.typeList);
      if (value instanceof AstTypeFunction) {
        properties["argTypes"] = typeList(value.argTypes);
        properties["argNames"] = value.argNames.map((n) =>
          n ? { type: "AstArgumentName", ...n } : null,
        );
      }
      if (value instanceof AstStatDeclareFunction) {
        properties["params"] = typeList(value.params);
        properties["paramNames"] = value.paramNames.map((n) => ({ type: "AstArgumentName", ...n }));
      }
      const out: Record<string, Json> = {
        type: value instanceof AstStatDeclareExternType ? "AstStatDeclareClass" : `Ast${value.kind}`,
        location: encode(value.location),
      };
      for (const name of names)
        if (properties[name] !== undefined)
          out[name] = encode(properties[name]);
      return out;
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        encode(item),
      ]),
    );
  }
  return encode(root);
}
