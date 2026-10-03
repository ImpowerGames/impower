// Definition sources are parsed by buildDefinitionAst.mjs with the pinned
// official Luau parser. This module loads data; it never parses source text.
import * as A from "./Ast";
import { Location, Position } from "./Location";

export interface DefinitionFile {
  version: number;
  parser: string;
  sourceSha256: string;
  root: unknown;
}

type ObjectNode = Record<string, unknown>;

function object(value: unknown): ObjectNode {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid definition AST object");
  return value as ObjectNode;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid definition AST string");
  return value;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid definition AST array");
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid definition AST boolean");
  return value;
}

function location(value: unknown): Location {
  const match = string(value).match(/^(\d+),(\d+) - (\d+),(\d+)$/);
  if (!match) throw new Error(`Invalid definition AST location: ${String(value)}`);
  return new Location(new Position(Number(match[1]), Number(match[2])), new Position(Number(match[3]), Number(match[4])));
}

function optionalLocation(value: unknown): Location | undefined {
  return value == null ? undefined : location(value);
}

function access(value: unknown): A.AstTableAccess {
  if (value !== A.AstTableAccess.Read && value !== A.AstTableAccess.Write && value !== A.AstTableAccess.ReadWrite)
    throw new Error("Definition AST has no valid property access; rebuild the official parser and definitions");
  return value;
}

function type(value: unknown): A.AstType {
  const result = node(value);
  if (!(result instanceof A.AstType)) throw new Error("Expected a definition AST type");
  return result;
}

function pack(value: unknown): A.AstTypePack {
  const result = node(value);
  if (!(result instanceof A.AstTypePack)) throw new Error("Expected a definition AST type pack");
  return result;
}

function expr(value: unknown): A.AstExpr {
  const result = node(value);
  if (!(result instanceof A.AstExpr)) throw new Error("Expected a definition AST expression");
  return result;
}

function stat(value: unknown): A.AstStat {
  const result = node(value);
  if (!(result instanceof A.AstStat)) throw new Error("Expected a definition AST statement");
  return result;
}

function typeList(value: unknown): A.AstTypeList {
  const n = object(value);
  return { types: array(n["types"]).map(type), tailType: n["tailType"] == null ? undefined : pack(n["tailType"]) };
}

function argument(value: unknown): A.AstArgumentName {
  const n = object(value);
  return { name: string(n["name"]), location: location(n["location"]) };
}

function indexer(value: unknown): A.AstTableIndexer | undefined {
  if (value == null) return undefined;
  const n = object(value);
  return {
    indexType: type(n["indexType"]), resultType: type(n["resultType"]),
    location: location(n["location"]), access: access(n["access"]), accessLocation: optionalLocation(n["accessLocation"]),
  };
}

function genericTypes(value: unknown): A.AstGenericType[] {
  return array(value).map((value) => {
    const n = object(value);
    // The official JSON format does not emit generic-name locations.
    return new A.AstGenericType(new Location(), string(n["name"]), n["luauType"] == null ? undefined : type(n["luauType"]));
  });
}

function genericPacks(value: unknown): A.AstGenericTypePack[] {
  return array(value).map((value) => {
    const n = object(value);
    return new A.AstGenericTypePack(new Location(), string(n["name"]), n["luauType"] == null ? undefined : pack(n["luauType"]));
  });
}

function attributes(value: unknown): A.AstAttr[] {
  return array(value).map((value) => {
    const n = object(value);
    const name = string(n["name"]);
    const kinds: Record<string, A.AstAttrType> = {
      checked: A.AstAttrType.Checked, native: A.AstAttrType.Native,
      deprecated: A.AstAttrType.Deprecated, debug_noinline: A.AstAttrType.DebugNoinline,
    };
    const kind = Object.hasOwn(kinds, name) ? kinds[name]! : A.AstAttrType.Unknown;
    return new A.AstAttr(location(n["location"]), kind, array(n["args"]).map(expr), name);
  });
}

function node(value: unknown): A.AstNode {
  const n = object(value);
  const loc = location(n["location"]);
  switch (n["type"]) {
    case "AstStatBlock": return new A.AstStatBlock(loc, array(n["body"]).map(stat), boolean(n["hasEnd"]));
    case "AstStatDeclareGlobal": return new A.AstStatDeclareGlobal(loc, string(n["name"]), location(n["nameLocation"]), type(n["luauType"]));
    case "AstStatDeclareFunction": return new A.AstStatDeclareFunction(
      loc, attributes(n["attributes"]), string(n["name"]), location(n["nameLocation"]),
      genericTypes(n["generics"]), genericPacks(n["genericPacks"]), typeList(n["params"]),
      array(n["paramNames"]).map(argument), boolean(n["vararg"]), location(n["varargLocation"]), pack(n["retTypes"]),
    );
    case "AstStatDeclareClass": return new A.AstStatDeclareExternType(
      loc, string(n["name"]), n["superName"] == null ? undefined : string(n["superName"]),
      array(n["props"]).map((value) => {
        const p = object(value);
        return {
          name: string(p["name"]), nameLocation: location(p["nameLocation"]), ty: type(p["luauType"]),
          location: location(p["location"]), isMethod: boolean(p["isMethod"]), access: access(p["access"]),
        };
      }), indexer(n["indexer"]),
    );
    case "AstStatTypeAlias": return new A.AstStatTypeAlias(
      loc, string(n["name"]), location(n["nameLocation"]), genericTypes(n["generics"]),
      genericPacks(n["genericPacks"]), type(n["value"]), boolean(n["exported"]),
    );
    case "AstTypeReference": return new A.AstTypeReference(
      loc, n["prefix"] == null ? undefined : string(n["prefix"]), string(n["name"]),
      optionalLocation(n["prefixLocation"]), location(n["nameLocation"]), boolean(n["hasParameterList"]),
      array(n["parameters"]).map((value) => {
        const result = node(value);
        if (result instanceof A.AstTypePack) return { typePack: result };
        if (result instanceof A.AstType) return { type: result };
        throw new Error("Invalid definition AST type argument");
      }),
    );
    case "AstTypeTable": return new A.AstTypeTable(loc, array(n["props"]).map((value) => {
      const p = object(value);
      return { name: string(p["name"]), location: location(p["location"]), type: type(p["propType"]), access: access(p["access"]), accessLocation: optionalLocation(p["accessLocation"]) };
    }), indexer(n["indexer"]));
    case "AstTypeFunction": return new A.AstTypeFunction(
      loc, attributes(n["attributes"]), genericTypes(n["generics"]), genericPacks(n["genericPacks"]),
      typeList(n["argTypes"]), array(n["argNames"]).map((v) => v == null ? undefined : argument(v)), pack(n["returnTypes"]),
    );
    case "AstTypeGroup": return new A.AstTypeGroup(loc, type(n["inner"]));
    case "AstTypeOptional": return new A.AstTypeOptional(loc);
    case "AstTypeUnion": return new A.AstTypeUnion(loc, array(n["types"]).map(type));
    case "AstTypeIntersection": return new A.AstTypeIntersection(loc, array(n["types"]).map(type));
    case "AstTypeSingletonBool": return new A.AstTypeSingletonBool(loc, boolean(n["value"]));
    case "AstTypeSingletonString": return new A.AstTypeSingletonString(loc, string(n["value"]));
    case "AstTypeTypeof": return new A.AstTypeTypeof(loc, expr(n["expr"]));
    case "AstTypePackExplicit": return new A.AstTypePackExplicit(loc, typeList(n["typeList"]));
    case "AstTypePackGeneric": return new A.AstTypePackGeneric(loc, string(n["genericName"]));
    case "AstTypePackVariadic": return new A.AstTypePackVariadic(loc, type(n["variadicType"]));
    case "AstExprConstantNil": return new A.AstExprConstantNil(loc);
    case "AstExprConstantBool": return new A.AstExprConstantBool(loc, boolean(n["value"]));
    case "AstExprConstantNumber": {
      const value = n["value"];
      if (typeof value !== "number" && value !== "Infinity" && value !== "-Infinity" && value !== "NaN") throw new Error("Invalid definition AST number");
      return new A.AstExprConstantNumber(loc, Number(value));
    }
    case "AstExprConstantString": return new A.AstExprConstantString(loc, string(n["value"]), A.QuoteStyle.QuotedSimple);
    case "AstExprGlobal": return new A.AstExprGlobal(loc, string(n["global"]));
    case "AstExprGroup": return new A.AstExprGroup(loc, expr(n["expr"]));
    case "AstExprCall": return new A.AstExprCall(loc, expr(n["func"]), array(n["args"]).map(expr), boolean(n["self"]), [], location(n["argLocation"]));
    case "AstExprIndexName": {
      const op = n["op"];
      if (op !== "." && op !== ":") throw new Error("Invalid definition AST member operator");
      const indexLocation = location(n["indexLocation"]);
      return new A.AstExprIndexName(loc, expr(n["expr"]), string(n["index"]), indexLocation, indexLocation.begin, op);
    }
    case "AstExprIndexExpr": return new A.AstExprIndexExpr(loc, expr(n["expr"]), expr(n["index"]));
    case "AstExprTable": return new A.AstExprTable(loc, array(n["items"]).map((value) => {
      const item = object(value);
      const kinds: Record<string, A.TableItemKind> = { item: A.TableItemKind.List, record: A.TableItemKind.Record, general: A.TableItemKind.General };
      const kind = string(item["kind"]);
      if (!Object.hasOwn(kinds, kind)) throw new Error("Invalid definition AST table item");
      return { kind: kinds[kind]!, key: item["key"] == null ? undefined : expr(item["key"]), value: expr(item["value"]) };
    }));
    default: throw new Error(`Unsupported definition AST node: ${String(n["type"])}`);
  }
}

/** Each load creates fresh nodes, since checking a definition may mutate them. */
export function loadDefinitionAst(file: DefinitionFile): A.AstStatBlock {
  if (file.version !== 1 || !/^[a-f0-9]{40}$/.test(file.parser) || !/^[a-f0-9]{64}$/.test(file.sourceSha256))
    throw new Error("Unsupported definition AST artifact; regenerate with buildDefinitionAst.mjs");
  const root = node(file.root);
  if (!(root instanceof A.AstStatBlock)) throw new Error("Definition AST root must be a block");
  return root;
}
