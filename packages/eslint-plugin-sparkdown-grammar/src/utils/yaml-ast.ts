// Shared helpers for inspecting the YAML AST produced by
// `yaml-eslint-parser`. We avoid pulling the parser's type exports in
// (they don't ship as a stable public surface), so we describe just the
// shape we depend on here. Anything ESLint visits with these names has
// these fields — `yaml-eslint-parser` is the only known producer.

import type { AST as ESTreeAST, Rule } from "eslint";

export interface YAMLScalar {
  type: "YAMLScalar";
  value: string | number | boolean | null;
  raw: string;
  parent: YAMLNode | null;
  loc: ESTreeAST.SourceLocation;
  range: [number, number];
}

export interface YAMLPair {
  type: "YAMLPair";
  key: YAMLNode | null;
  value: YAMLNode | null;
  parent: YAMLNode | null;
  loc: ESTreeAST.SourceLocation;
  range: [number, number];
}

export interface YAMLMapping {
  type: "YAMLMapping";
  pairs: YAMLPair[];
  parent: YAMLNode | null;
  loc: ESTreeAST.SourceLocation;
  range: [number, number];
}

export interface YAMLSequence {
  type: "YAMLSequence";
  entries: (YAMLNode | null)[];
  parent: YAMLNode | null;
  loc: ESTreeAST.SourceLocation;
  range: [number, number];
}

export interface YAMLDocument {
  type: "YAMLDocument";
  content: YAMLNode | null;
  parent: YAMLNode | null;
  loc: ESTreeAST.SourceLocation;
  range: [number, number];
}

export interface YAMLProgram {
  type: "Program";
  body: YAMLDocument[];
  parent: null;
  loc: ESTreeAST.SourceLocation;
  range: [number, number];
}

export type YAMLNode =
  | YAMLProgram
  | YAMLDocument
  | YAMLMapping
  | YAMLSequence
  | YAMLPair
  | YAMLScalar;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function isMapping(node: YAMLNode | null): node is YAMLMapping {
  return node?.type === "YAMLMapping";
}

export function isSequence(node: YAMLNode | null): node is YAMLSequence {
  return node?.type === "YAMLSequence";
}

export function isScalar(node: YAMLNode | null): node is YAMLScalar {
  return node?.type === "YAMLScalar";
}

export function scalarKey(pair: YAMLPair): string | null {
  if (isScalar(pair.key) && typeof pair.key.value === "string") {
    return pair.key.value;
  }
  return null;
}

export function findPair(
  mapping: YAMLMapping,
  key: string,
): YAMLPair | undefined {
  for (const pair of mapping.pairs) {
    if (scalarKey(pair) === key) return pair;
  }
  return undefined;
}

export function getStringValue(
  mapping: YAMLMapping,
  key: string,
): { value: string; node: YAMLScalar } | undefined {
  const pair = findPair(mapping, key);
  if (pair && isScalar(pair.value) && typeof pair.value.value === "string") {
    return { value: pair.value.value, node: pair.value };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Grammar-shape recognition
// ---------------------------------------------------------------------------

// Returns true when `mapping` is the top-level grammar document mapping
// (i.e. the document root is this mapping). Used to find `repository:`,
// `variables:`, etc. without descending into nested rules with the same
// key names.
export function isDocumentRoot(mapping: YAMLMapping): boolean {
  const parent = mapping.parent;
  return parent?.type === "YAMLDocument";
}

// Returns true if `mapping` is a *rule* mapping — a value sitting either
//   - as `repository.<RuleName>` (one hop: Mapping → Pair(RuleName) →
//     Mapping(repository's value) → Pair(repository)), or
//   - inside any `patterns:` sequence anywhere in the file (one hop:
//     Mapping → Sequence → Pair(patterns)).
// Capture-block values (under `captures:` / `beginCaptures:` /
// `endCaptures:`) are intentionally NOT classified as rules: those are
// positional scope assignments, not patterns.
export function isRuleMapping(mapping: YAMLMapping): boolean {
  const parent = mapping.parent;
  if (!parent) return false;

  // Case A: inside a `patterns:` sequence.
  if (parent.type === "YAMLSequence") {
    const seqParent = parent.parent;
    if (seqParent?.type === "YAMLPair" && scalarKey(seqParent) === "patterns") {
      return true;
    }
    return false;
  }

  // Case B: as the value of a pair whose grandparent pair is keyed
  // `repository`. The intermediate Mapping holds the rule registry; we
  // want the leaf-mappings, not the registry itself.
  if (parent.type === "YAMLPair" && parent.value === mapping) {
    const containerMapping = parent.parent;
    if (containerMapping?.type === "YAMLMapping") {
      const containerPair = containerMapping.parent;
      if (
        containerPair?.type === "YAMLPair" &&
        scalarKey(containerPair) === "repository"
      ) {
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Source-range helpers for ESLint reporting
// ---------------------------------------------------------------------------

// Maps an offset inside a YAML scalar's *parsed* string value to its
// position in the *source* file (used to highlight precise sub-ranges
// of a regex pattern rather than the whole scalar). Handles the two
// common scalar styles in this grammar:
//   - plain (unquoted): `raw === value`, offset maps 1:1
//   - single-quoted: `raw === "'" + value + "'"` provided the value
//     contains no `'` (single-quoted YAML escapes a quote by doubling
//     it; if `value` contains `'`, the offset arithmetic is ambiguous
//     and we bail out)
// Returns `null` for any case it can't map cleanly — callers should
// fall back to highlighting the whole scalar.
export function valueOffsetToSourceIndex(
  scalar: YAMLScalar,
  valueOffset: number,
): number | null {
  if (typeof scalar.value !== "string") return null;
  const value = scalar.value;
  const raw = scalar.raw;
  if (valueOffset < 0 || valueOffset > value.length) return null;
  if (raw === value) {
    return scalar.range[0] + valueOffset;
  }
  if (
    raw.startsWith("'") &&
    raw.endsWith("'") &&
    raw.length === value.length + 2 &&
    !value.includes("'")
  ) {
    return scalar.range[0] + 1 + valueOffset;
  }
  return null;
}

// Builds an ESLint `loc` (line/column start + end) for the slice
// `[valueOffset, valueOffset + length)` inside a scalar's value, or
// returns the scalar's full loc if the slice can't be mapped.
export function rangeInScalar(
  context: Rule.RuleContext,
  scalar: YAMLScalar,
  valueOffset: number,
  length: number,
): Rule.ReportDescriptor["loc"] {
  const startIndex = valueOffsetToSourceIndex(scalar, valueOffset);
  const endIndex = valueOffsetToSourceIndex(scalar, valueOffset + length);
  if (startIndex == null || endIndex == null) return scalar.loc;
  const sc = context.sourceCode;
  return {
    start: sc.getLocFromIndex(startIndex),
    end: sc.getLocFromIndex(endIndex),
  };
}
