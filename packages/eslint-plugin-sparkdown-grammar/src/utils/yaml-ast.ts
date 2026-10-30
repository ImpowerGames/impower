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

export function isDocumentRoot(mapping: YAMLMapping): boolean {
  const parent = mapping.parent;
  return parent?.type === "YAMLDocument";
}

export function isRuleMapping(mapping: YAMLMapping): boolean {
  const parent = mapping.parent;
  if (!parent) return false;

  if (parent.type === "YAMLSequence") {
    const seqParent = parent.parent;
    if (seqParent?.type === "YAMLPair" && scalarKey(seqParent) === "patterns") {
      return true;
    }
    return false;
  }

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

export function rangeInScalar(
  context: Rule.RuleContext,
  scalar: YAMLScalar,
  valueOffset: number,
  length: number,
): ESTreeAST.SourceLocation {
  const startIndex = valueOffsetToSourceIndex(scalar, valueOffset);
  const endIndex = valueOffsetToSourceIndex(scalar, valueOffset + length);
  if (startIndex == null || endIndex == null) return scalar.loc;
  const sc = context.sourceCode;
  return {
    start: sc.getLocFromIndex(startIndex),
    end: sc.getLocFromIndex(endIndex),
  };
}
