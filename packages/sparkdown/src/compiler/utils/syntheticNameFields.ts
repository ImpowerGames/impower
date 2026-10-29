import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";

export const IDENTIFIER_FIELDS = [
  "identifier",
  "pathIdentifiers",
  "unresolvedMember",
  "variableIdentifier",
  "modifier",
  "type",
  "name",
];

export const NAME_STRING_FIELDS = ["tempName", "variableName"];

export const namesHeldBy = (node: ParsedObject): string[] => {
  const out: string[] = [];
  for (const field of IDENTIFIER_FIELDS) {
    const value = (node as unknown as Record<string, unknown>)[field];
    for (const id of Array.isArray(value) ? value : [value]) {
      if (id instanceof Identifier && id.name) {
        out.push(id.name);
      }
    }
  }
  for (const field of NAME_STRING_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(node, field)) {
      const value = (node as unknown as Record<string, unknown>)[field];
      if (typeof value === "string") {
        out.push(value);
      }
    }
  }
  return out;
};
