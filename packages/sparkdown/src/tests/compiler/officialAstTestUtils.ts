import { parseOfficialSyntax } from "./officialSyntax";
import type { Json } from "./officialLuau";

type ObjectJson = { [key: string]: Json };
type BlockJson = ObjectJson & { body: ObjectJson[] };

/** Compatibility shape for test plumbing, without decoding JSON into compiler nodes. */
export function parseOfficialTree(source: string) {
  const result = parseOfficialSyntax(source);
  return { root: result.root as BlockJson, errors: result.diagnostics };
}

/** Structural comparison deliberately omits positions; the position oracle checks those separately. */
export function withoutLocations(value: Json): Json {
  if (Array.isArray(value)) return value.map(withoutLocations);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .filter(([key]) => !/^(location|.*Location)$/.test(key))
    .map(([key, item]) => [key, withoutLocations(item)]));
}

export function jsonNodes(value: Json): ObjectJson[] {
  if (Array.isArray(value)) return value.flatMap(jsonNodes);
  if (!value || typeof value !== "object") return [];
  // AstLocal is binding metadata, not an AstNode visited by the original
  // position oracle. Its annotation remains traversed below as an AstNode.
  const own = typeof value["type"] === "string" && value["type"].startsWith("Ast") && value["type"] !== "AstLocal" && typeof value["location"] === "string" ? [value] : [];
  return [...own, ...Object.values(value).flatMap(jsonNodes)];
}

export function jsonLocation(node: ObjectJson) {
  const match = String(node["location"]).match(/^(\d+),(\d+) - (\d+),(\d+)$/);
  if (!match) throw new Error(`Invalid official AST location ${node["location"]}`);
  return { begin: { line: Number(match[1]), column: Number(match[2]) }, end: { line: Number(match[3]), column: Number(match[4]) } };
}
