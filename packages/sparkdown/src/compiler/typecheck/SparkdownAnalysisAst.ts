// Backend-independent transfer of the existing converter's AST. Native decoding
// is a separate adapter: this module neither parses source nor lowers synthetic
// expressions to invented Luau source.
import { AstLocal, AstNode, AstStat, AstStatBlock, AstStatAssign, AstStatSparkdownExplicit, AstStatSparkdownStore, AstStatSparkdownChoose } from "./Ast";
import { Location, Position } from "./Location";
import type { LuauUnit } from "./LuauDocumentChecker";
import type { LuauSyntaxError } from "./readLuauAst";

export type SparkdownAnalysisValue = null | boolean | number | string
  | { tag: "absent" }
  | { tag: "number"; value: "nan" | "infinity" | "-infinity" | "-zero" }
  | { tag: "node" | "local"; id: number }
  | { tag: "position"; line: number; column: number }
  | { tag: "range"; begin: [number, number]; end: [number, number] }
  | { tag: "array"; values: SparkdownAnalysisValue[] }
  | { tag: "record"; fields: Record<string, SparkdownAnalysisValue> };

export interface SparkdownAnalysisNode {
  kind: string;
  range: { begin: [number, number]; end: [number, number] };
  fields: Record<string, SparkdownAnalysisValue>;
}

export interface SparkdownAnalysisAst {
  schemaVersion: 1;
  positionEncoding: "utf16";
  root: number;
  nodes: SparkdownAnalysisNode[];
  locals: Record<string, SparkdownAnalysisValue>[];
  errors: { range: { begin: [number, number]; end: [number, number] }; message: string; malformed?: LuauSyntaxError["malformed"] }[];
  hotcomments: { range: { begin: [number, number]; end: [number, number] }; header: boolean; content: string }[];
  commentLocations: { kind: "Comment" | "BlockComment" | "BrokenComment"; range: { begin: [number, number]; end: [number, number] } }[];
}

// Explicit inventory prevents a new converter field/tag from being silently
// omitted. Decoder constructors must separately verify the pinned Ast.h fields.
const FIELDS: Readonly<Record<string, readonly string[]>> = {
  ExprGroup: ["expr"], ExprConstantNil: [], ExprConstantBool: ["value"],
  ExprConstantNumber: ["value", "malformed"], ExprConstantString: ["value", "quoteStyle"],
  ExprLocal: ["local", "upvalue"], ExprGlobal: ["name"], ExprVarargs: [],
  ExprCall: ["func", "args", "self", "typeArguments", "argLocation"],
  ExprIndexName: ["expr", "index", "indexLocation", "opPosition", "op"], ExprIndexExpr: ["expr", "index"],
  Attr: ["type", "args", "name"], GenericType: ["name", "defaultValue"], GenericTypePack: ["name", "defaultValue"],
  ExprFunction: ["attributes", "generics", "genericPacks", "self", "args", "vararg", "varargLocation", "body", "functionDepth", "debugname", "returnAnnotation", "varargAnnotation", "argLocation"],
  ExprTable: ["items"], ExprUnary: ["op", "expr"], ExprBinary: ["op", "left", "right"],
  ExprTypeAssertion: ["expr", "annotation"], ExprIfElse: ["condition", "hasThen", "trueExpr", "hasElse", "falseExpr"],
  ExprInterpString: ["strings", "expressions"], ExprInstantiate: ["expr", "typeArguments"], ExprError: ["expressions", "messageIndex"],
  StatBlock: ["body", "hasEnd"], StatIf: ["condition", "thenbody", "elsebody", "thenLocation", "elseLocation"],
  StatWhile: ["condition", "body", "hasDo", "doLocation"], StatRepeat: ["condition", "body"], StatBreak: [], StatContinue: [],
  StatReturn: ["list"], StatExpr: ["expr"], StatLocal: ["vars", "values", "equalsSignLocation", "isConst", "isExported", "keywordLocation"],
  StatFor: ["variable", "from", "to", "step", "body", "hasDo", "doLocation"],
  StatForIn: ["vars", "values", "body", "hasIn", "inLocation", "hasDo", "doLocation"],
  StatAssign: ["vars", "values"], StatCompoundAssign: ["op", "variable", "value"],
  StatFunction: ["name", "func"], StatLocalFunction: ["name", "func", "isConst", "constKeywordBegin"],
  StatTypeAlias: ["name", "nameLocation", "generics", "genericPacks", "type", "exported"],
  StatTypeFunction: ["name", "nameLocation", "body", "exported", "hasErrors"],
  StatDeclareGlobal: ["name", "nameLocation", "type"],
  StatDeclareFunction: ["attributes", "name", "nameLocation", "generics", "genericPacks", "params", "paramNames", "vararg", "varargLocation", "retTypes"],
  StatDeclareExternType: ["name", "superName", "props", "indexer"], StatError: ["expressions", "statements", "messageIndex"],
  // Absent prefixLocal means converter metadata is unavailable. Explicit null
  // means the authoritative parser found a global/unresolved prefix.
  TypeReference: ["prefix", "name", "prefixLocation", "nameLocation", "hasParameterList", "parameters", "prefixLocal"],
  TypeTable: ["props", "indexer"], TypeFunction: ["attributes", "generics", "genericPacks", "argTypes", "argNames", "returnTypes"],
  TypeTypeof: ["expr"], TypeOptional: [], TypeUnion: ["types"], TypeIntersection: ["types"],
  TypeError: ["types", "isMissing", "messageIndex"], TypeSingletonBool: ["value"], TypeSingletonString: ["value"], TypeGroup: ["type"],
  TypePackExplicit: ["typeList"], TypePackVariadic: ["variadicType"], TypePackGeneric: ["genericName"],
  SparkdownDivertTarget: ["path"], SparkdownRegex: ["pattern", "flags"],
  SparkdownConditionalAlternator: [], SparkdownSequentialAlternator: [],
  SparkdownNew: ["className", "classNameLocation", "args", "hasArgs"], SparkdownCallShorthand: ["expr"],
  SparkdownInterpString: ["strings", "expressions", "luauValue"], SparkdownFlowArgument: [],
  SparkdownExplicit: ["statement", "markLocation"], SparkdownStore: ["vars", "annotations", "values", "equalsSignLocation"],
  SparkdownChoose: ["body", "gather"],
};

const LOCAL_FIELDS = ["name", "location", "shadow", "functionDepth", "loopDepth", "annotation", "isConst", "isExported"] as const;
export const SPARKDOWN_ANALYSIS_AST_FIELDS = FIELDS;
export const SPARKDOWN_ANALYSIS_LOCAL_FIELDS = LOCAL_FIELDS;
const SOURCE_METADATA = new Set(["SparkdownDivertTarget", "SparkdownRegex", "SparkdownConditionalAlternator", "SparkdownSequentialAlternator"]);

function validateFields(object: AstNode | AstLocal, fields: readonly string[]): void {
  const accepted = new Set<string>(fields);
  if (object instanceof AstNode) {
    accepted.add("kind"); accepted.add("location");
    if (object instanceof AstStat) accepted.add("hasSemicolon");
    if (SOURCE_METADATA.has(object.kind)) accepted.add("source");
  }
  for (const name of Object.keys(object)) if (!accepted.has(name))
    throw new Error(`Unsupported analysis AST field ${object instanceof AstNode ? object.kind : "Local"}.${name}`);
}

// SparkdownReading.luauStatements is the semantic boundary. Apply its exact
// statement-list lowering without modifying the AST shared with lints/runtime.
// Choose opens no scope; annotations on Store are intentionally not part of
// the assignment checked by the current checker. New wrapper fields still fail
// closed before lowering can discard them.
function lowerStatements(statements: readonly AstStat[], active = new Set<AstStat>(), depth = 0): AstStat[] {
  if (depth > 128) throw new Error("Analysis statement lowering depth limit");
  return statements.flatMap(stat => {
    if (!(stat instanceof AstStatSparkdownExplicit || stat instanceof AstStatSparkdownStore || stat instanceof AstStatSparkdownChoose)) return [stat];
    if (active.has(stat)) throw new Error("Cyclic analysis statement wrapper");
    validateFields(stat, FIELDS[stat.kind]!);
    active.add(stat);
    try {
      if (stat instanceof AstStatSparkdownExplicit) return lowerStatements([stat.statement], active, depth + 1);
      if (stat instanceof AstStatSparkdownStore) return [new AstStatAssign(stat.location, stat.vars, stat.values)];
      validateFields(stat.body, FIELDS[stat.body.kind]!);
      if (stat.gather) validateFields(stat.gather, FIELDS[stat.gather.kind]!);
      return lowerStatements([...stat.body.body, ...(stat.gather?.body ?? [])], active, depth + 1);
    } finally { active.delete(stat); }
  });
}

const range = (location: Location) => ({
  begin: [location.begin.line, location.begin.column] as [number, number],
  end: [location.end.line, location.end.column] as [number, number],
});

/** Encodes identities before following edges, including self-referential locals.
 * Constant-string values remain Luau byte strings, not re-encoded UTF8 text.
 * Absolute document offsets/tree objects are excluded from synthetic source
 * metadata: their semantics/ranges already stand in the node and unit map.
 */
export function encodeSparkdownAnalysisAst(unit: LuauUnit): SparkdownAnalysisAst {
  if (!Array.isArray(unit.commentLocations)) throw new Error("Analysis input requires authoritative lexical comment metadata");
  const nodes: SparkdownAnalysisNode[] = [];
  const locals: Record<string, SparkdownAnalysisValue>[] = [];
  const nodeIds = new Map<AstNode, number>();
  const localIds = new Map<AstLocal, number>();
  const pending: (AstNode | AstLocal)[] = [];
  const inline = new Set<object>();
  const maximumRecords = 100000;
  const reference = (object: AstNode | AstLocal): SparkdownAnalysisValue => {
    const isLocal = object instanceof AstLocal;
    const ids = isLocal ? localIds : nodeIds;
    const prior = ids.get(object as AstLocal & AstNode);
    if (prior !== undefined) return { tag: isLocal ? "local" : "node", id: prior };
    if (pending.length >= maximumRecords) throw new Error("Analysis AST exceeds record limit");
    const id = ids.size;
    ids.set(object as AstLocal & AstNode, id);
    pending.push(object);
    return { tag: isLocal ? "local" : "node", id };
  };
  const value = (input: unknown, depth = 0): SparkdownAnalysisValue => {
    if (input === undefined) return { tag: "absent" };
    if (input === null || typeof input === "boolean" || typeof input === "string") return input;
    if (typeof input === "number") {
      if (Number.isNaN(input)) return { tag: "number", value: "nan" };
      if (!Number.isFinite(input)) return { tag: "number", value: input < 0 ? "-infinity" : "infinity" };
      if (Object.is(input, -0)) return { tag: "number", value: "-zero" };
      return input;
    }
    if (input instanceof AstNode || input instanceof AstLocal) return reference(input);
    if (input instanceof Location) return { tag: "range", ...range(input) };
    if (input instanceof Position) return { tag: "position", line: input.line, column: input.column };
    if (typeof input !== "object") throw new Error("Unsupported analysis AST value");
    if (depth > 128 || inline.has(input)) throw new Error("Cyclic or excessively nested analysis AST record");
    if (!Array.isArray(input) && Object.getPrototypeOf(input) !== Object.prototype) throw new Error("Unsupported analysis AST object");
    inline.add(input);
    try {
      if (Array.isArray(input)) return { tag: "array", values: input.map((item) => value(item, depth + 1)) };
      return { tag: "record", fields: Object.fromEntries(Object.entries(input).map(([name, item]) => [name, value(item, depth + 1)])) };
    } finally {
      inline.delete(input);
    }
  };
  const root = reference(unit.root);
  if (!(typeof root === "object" && root !== null && "tag" in root && root.tag === "node")) throw new Error("Invalid analysis root");
  for (let i = 0; i < pending.length; i++) {
    const object = pending[i]!;
    const isLocal = object instanceof AstLocal;
    const own = object as unknown as Record<string, unknown>;
    const fields = isLocal ? LOCAL_FIELDS : FIELDS[object.kind];
    if (!fields) throw new Error(`Unsupported analysis AST tag ${object instanceof AstNode ? object.kind : "Local"}`);
    validateFields(object, fields);
    const encoded = Object.fromEntries(fields.map((name) => [name, value(object instanceof AstStatBlock && name === "body" ? lowerStatements(object.body) : own[name])]));
    if (isLocal) locals[localIds.get(object)!] = encoded;
    else {
      if (object instanceof AstStat) encoded["hasSemicolon"] = object.hasSemicolon;
      nodes[nodeIds.get(object)!] = { kind: object.kind, range: range(object.location), fields: encoded };
    }
  }
  return {
    schemaVersion: 1, positionEncoding: "utf16", root: root.id, nodes, locals,
    errors: unit.errors.map((error) => ({ range: range(error.location), message: error.message, malformed: error.malformed })),
    hotcomments: (unit.kind === "file" ? unit.hotcomments : []).map((comment) => ({ range: range(comment.location), header: comment.header, content: comment.content })),
    commentLocations: unit.commentLocations.map(comment => ({ kind: comment.kind, range: range(comment.location) })),
  };
}
