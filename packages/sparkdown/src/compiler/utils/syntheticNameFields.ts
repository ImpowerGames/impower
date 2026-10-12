import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";

// The fields `SparkdownCompiler.canonicalizeSyntheticFlowNames` reads
// synthetic names from, in the order it reads them; the statement memo reads
// a loop's names in the same order (`statementMemo.ts`, #1683).
//
// Every Identifier-bearing field in the ParsedHierarchy (from the class
// declarations): the base `identifier`, Divert/VariableReference
// `pathIdentifiers`, VariableReference `unresolvedMember`,
// VariableAssignment `variableIdentifier`,
// StructDefinition `modifier`/`type`/`name`, List `itemIdentifierList`.
// Visiting these directly instead of sweeping `Object.keys(node)` per node
// is what keeps the pass cheap (no per-node key-array allocation over the
// whole tree). If a new Identifier-valued field is ever added to a parsed
// node, it must be listed here — the incremental oracle's synthetic-name
// fuzz and the conformance suite are the safety net for a miss.
export const IDENTIFIER_FIELDS = [
  "identifier",
  "pathIdentifiers",
  "unresolvedMember",
  "variableIdentifier",
  "modifier",
  "type",
  "name",
  "itemIdentifierList",
];

// A few nodes hold a synthetic name as a PLAIN STRING (not an Identifier) and
// emit runtime variable refs straight from it — `StashAndRereadExpression.tempName`
// (the `__mcall_<from>` receiver stash), `StashedTempReadExpression.tempName`
// (the method lookup's read of that stash) and `VariablePointerExpression.variableName`.
// They share one remap with the Identifier-shaped names, so a temp's stash,
// its reads and any Identifier naming it stay in lockstep.
// Only SYNTH-matching values are touched, so user strings/display text are safe.
// Only a node's own data property is a plain-string name: `VariableAssignment`
// exposes `variableName` as a read-only getter over its identifier, which the
// identifier pass already renames, and writing through it throws.
export const NAME_STRING_FIELDS = ["tempName", "variableName"];

/** The names `node` itself holds in those fields, in the order the pass
 *  reads them: its Identifiers', then its own plain-string names. */
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
