import {
  SPARKDOWN_ANALYSIS_AST_FIELDS, SPARKDOWN_ANALYSIS_LOCAL_FIELDS,
  type SparkdownAnalysisAst, type SparkdownAnalysisValue,
} from "./SparkdownAnalysisAst";
import type { AnalysisAst, AnalysisAstValue } from "../../analysis-backend/contract";

export type SparkdownAnalysisCompactValue = AnalysisAstValue;
export type SparkdownAnalysisCompactAst = AnalysisAst;

// Arrays are always tagged. Scalars retain their original exact JSON values;
// string values remain converter byte strings, including NUL and Latin1.
const SPECIAL_NUMBERS = ["nan", "infinity", "-infinity", "-zero"] as const;
const packed = new WeakMap<SparkdownAnalysisAst, SparkdownAnalysisCompactAst>();
function value(input: SparkdownAnalysisValue, depth = 0): SparkdownAnalysisCompactValue {
  if (depth > 128) throw new Error("Analysis compact value depth limit");
  if (input === null || typeof input !== "object") return input;
  switch (input.tag) {
    case "absent": return [0];
    case "number": {
      const index = SPECIAL_NUMBERS.indexOf(input.value);
      if (index < 0) throw new Error("Unknown analysis special number");
      return [1, index];
    }
    case "node": return [2, input.id];
    case "local": return [3, input.id];
    case "position": return [4, input.line, input.column];
    case "range": return [5, ...input.begin, ...input.end];
    case "array": return [6, ...input.values.map(item => value(item, depth + 1))];
    case "record": return [7, ...Object.entries(input.fields).map(([key, item]) => [key, value(item, depth + 1)])];
    default: throw new Error("Unknown analysis compact value tag");
  }
}

/** Compacts an already encoded semantic input. Immutable retained inputs are
 * packed once; unchanged units never repeat encoding, packing or transfer.
 */
export function packSparkdownAnalysisAst(ast: SparkdownAnalysisAst): SparkdownAnalysisCompactAst {
  if (ast.schemaVersion !== 1 || ast.positionEncoding !== "utf16") throw new Error("Unsupported analysis AST schema");
  const immutable = Object.isFrozen(ast);
  const cached = immutable ? packed.get(ast) : undefined;
  if (cached) return cached;
  const layouts: string[][] = [];
  const kinds = new Map<string, number>();
  const nodes = ast.nodes.map(node => {
    const declared = SPARKDOWN_ANALYSIS_AST_FIELDS[node.kind];
    if (!declared) throw new Error("Unknown analysis constructor " + node.kind);
    const fields = [...declared, ...(node.kind.startsWith("Stat") || ["SparkdownExplicit", "SparkdownStore", "SparkdownChoose"].includes(node.kind) ? ["hasSemicolon"] : [])];
    if (Object.keys(node.fields).length !== fields.length || fields.some(field => !Object.hasOwn(node.fields, field)))
      throw new Error("Invalid analysis constructor fields " + node.kind);
    let layout = kinds.get(node.kind);
    if (layout === undefined) {
      layout = layouts.length;
      kinds.set(node.kind, layout);
      layouts.push([node.kind, ...fields]);
    } else {
      const existing = layouts[layout]!;
      if (existing.length !== fields.length + 1
        || fields.some((field, index) => existing[index + 1] !== field)) throw new Error("Inconsistent analysis constructor layout");
    }
    return [layout, ...node.range.begin, ...node.range.end, ...fields.map(field => value(node.fields[field]!))];
  });
  const locals = ast.locals.map(local => {
    if (Object.keys(local).length !== SPARKDOWN_ANALYSIS_LOCAL_FIELDS.length
      || SPARKDOWN_ANALYSIS_LOCAL_FIELDS.some(field => !Object.hasOwn(local, field))) throw new Error("Invalid analysis local fields");
    return SPARKDOWN_ANALYSIS_LOCAL_FIELDS.map(field => value(local[field]!));
  });
  const result: SparkdownAnalysisCompactAst = {
    schemaVersion: 2, positionEncoding: "utf16", root: ast.root, layouts, nodes, locals, errors: ast.errors, hotcomments: ast.hotcomments, commentLocations: ast.commentLocations,
  };
  if (immutable) {
    const pending: object[] = [result], seen = new Set<object>();
    while (pending.length) {
      const item = pending.pop()!;
      if (seen.has(item)) continue;
      seen.add(item);
      for (const field of Object.values(item)) if (field && typeof field === "object") pending.push(field);
      Object.freeze(item);
    }
    packed.set(ast, result);
  }
  return result;
}
