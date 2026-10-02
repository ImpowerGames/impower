// A whole-file index of the grammar, shared by the rules that reason
// across rules (reachability, repeated fragments, rival-rule comments).
// Built once per linted file from `context.sourceCode` and cached.
//
// Owners: every finding these rules report belongs to an *owner*, the
// unit the baseline counts and the unit a justifying comment sits
// above. An owner is a repository rule (`repository.Name`, including
// every inline rule nested in its `patterns:` and capture handlers), a
// variable (`variables.NAME`), or the top-level `patterns:` list
// (`patterns`).

import type { Rule } from "eslint";
import {
  findPair,
  isMapping,
  isScalar,
  isSequence,
  scalarKey,
  type YAMLMapping,
  type YAMLNode,
  type YAMLPair,
  type YAMLScalar,
} from "./yaml-ast.ts";

export const PATTERN_KEYS = ["match", "begin", "end"] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];

export interface Owner {
  // Baseline key: `repository.Name`, `variables.NAME` or `patterns`.
  id: string;
  // Bare rule or variable name (`patterns` for the top-level list).
  name: string;
  kind: "rule" | "variable" | "patterns";
  // The pair that declares the owner (absent for `patterns`).
  pair?: YAMLPair;
}

// One regex-bearing scalar: a rule's `match`/`begin`/`end`, or a string
// variable's value.
export interface PatternSite {
  owner: Owner;
  key: PatternKey | "value";
  scalar: YAMLScalar;
  source: string;
  // The rule mapping holding the pattern (absent for a variable).
  mapping?: YAMLMapping;
  // 1-based lines whose comment block above may describe this site: the
  // owner's key line, the inline rule mapping's first line and the
  // pattern key's own line.
  anchorLines: number[];
}

export interface GrammarIndex {
  root: YAMLMapping | null;
  rules: Map<string, YAMLPair>;
  variables: Map<string, YAMLPair>;
  // Every rule mapping (repository and inline) with its owner.
  ruleMappings: { owner: Owner; mapping: YAMLMapping }[];
  patternSites: PatternSite[];
  // The contiguous `#` comment lines directly above a 1-based line, top
  // to bottom, with the `#` and one following space stripped. A blank
  // or code line ends the block.
  commentBlockAbove(line: number): string[];
}

const cache = new WeakMap<object, GrammarIndex>();

export function getGrammarIndex(context: Rule.RuleContext): GrammarIndex {
  const sourceCode = context.sourceCode;
  const cached = cache.get(sourceCode);
  if (cached) return cached;
  const index = buildIndex(sourceCode);
  cache.set(sourceCode, index);
  return index;
}

function documentRoot(ast: unknown): YAMLMapping | null {
  const program = ast as { body?: { content: YAMLNode | null }[] };
  const content = program.body?.[0]?.content ?? null;
  return isMapping(content) ? content : null;
}

function buildIndex(sourceCode: Rule.RuleContext["sourceCode"]): GrammarIndex {
  const root = documentRoot(sourceCode.ast);
  const lines = sourceCode.lines;
  const rules = new Map<string, YAMLPair>();
  const variables = new Map<string, YAMLPair>();
  const ruleMappings: { owner: Owner; mapping: YAMLMapping }[] = [];
  const patternSites: PatternSite[] = [];

  const commentBlockAbove = (line: number): string[] => {
    const block: string[] = [];
    for (let i = line - 2; i >= 0; i--) {
      const text = lines[i]?.trim() ?? "";
      if (!text.startsWith("#")) break;
      block.unshift(text.replace(/^#\s?/, ""));
    }
    return block;
  };

  const walkRule = (owner: Owner, mapping: YAMLMapping): void => {
    ruleMappings.push({ owner, mapping });
    const ownerLine = owner.pair?.loc.start.line;
    for (const key of PATTERN_KEYS) {
      const pair = findPair(mapping, key);
      if (pair && isScalar(pair.value) && typeof pair.value.value === "string") {
        const anchors = [mapping.loc.start.line, pair.loc.start.line];
        if (ownerLine !== undefined) anchors.unshift(ownerLine);
        patternSites.push({
          owner,
          key,
          scalar: pair.value,
          source: pair.value.value,
          mapping,
          anchorLines: [...new Set(anchors)],
        });
      }
    }
    walkNestedRules(owner, mapping);
  };

  // Inline rules sit in `patterns:` sequences, directly or inside a
  // capture handler (`captures: { 1: { patterns: [...] } }`).
  const walkNestedRules = (owner: Owner, mapping: YAMLMapping): void => {
    for (const pair of mapping.pairs) {
      const key = scalarKey(pair);
      if (key === "patterns" && isSequence(pair.value)) {
        for (const entry of pair.value.entries) {
          if (isMapping(entry)) walkRule(owner, entry);
        }
      } else if (
        (key === "captures" ||
          key === "beginCaptures" ||
          key === "endCaptures") &&
        isMapping(pair.value)
      ) {
        for (const capture of pair.value.pairs) {
          if (isMapping(capture.value)) walkNestedRules(owner, capture.value);
        }
      }
    }
  };

  if (root) {
    const variablesPair = findPair(root, "variables");
    if (variablesPair && isMapping(variablesPair.value)) {
      for (const pair of variablesPair.value.pairs) {
        const name = scalarKey(pair);
        if (!name) continue;
        variables.set(name, pair);
        if (isScalar(pair.value) && typeof pair.value.value === "string") {
          patternSites.push({
            owner: { id: `variables.${name}`, name, kind: "variable", pair },
            key: "value",
            scalar: pair.value,
            source: pair.value.value,
            anchorLines: [pair.loc.start.line],
          });
        }
      }
    }
    const repositoryPair = findPair(root, "repository");
    if (repositoryPair && isMapping(repositoryPair.value)) {
      for (const pair of repositoryPair.value.pairs) {
        const name = scalarKey(pair);
        if (!name || !isMapping(pair.value)) continue;
        rules.set(name, pair);
        walkRule(
          { id: `repository.${name}`, name, kind: "rule", pair },
          pair.value,
        );
      }
    }
    const patternsPair = findPair(root, "patterns");
    if (patternsPair && isSequence(patternsPair.value)) {
      const owner: Owner = { id: "patterns", name: "patterns", kind: "patterns" };
      for (const entry of patternsPair.value.entries) {
        if (isMapping(entry)) walkRule(owner, entry);
      }
    }
  }

  return {
    root,
    rules,
    variables,
    ruleMappings,
    patternSites,
    commentBlockAbove,
  };
}

// The lines of the first comment block above any of `lines` that holds a
// `marker` line, from the marker line to the end of that block (so a
// justification may run on over several comment lines). `null` when no
// block carries the marker.
export function markedComment(
  index: GrammarIndex,
  lines: number[],
  marker: string,
): string[] | null {
  for (const line of lines) {
    const block = index.commentBlockAbove(line);
    const at = block.findIndex((text) => text.startsWith(marker));
    if (at >= 0) return block.slice(at);
  }
  return null;
}

// Every `include: "#Name"` target anywhere under `node`.
export function includesUnder(node: YAMLNode | null): string[] {
  const found: string[] = [];
  const walk = (n: YAMLNode | null): void => {
    if (!n) return;
    if (isMapping(n)) {
      for (const pair of n.pairs) {
        if (
          scalarKey(pair) === "include" &&
          isScalar(pair.value) &&
          typeof pair.value.value === "string"
        ) {
          if (pair.value.value.startsWith("#")) {
            found.push(pair.value.value.slice(1));
          }
        } else {
          walk(pair.value);
        }
      }
    } else if (isSequence(n)) {
      for (const entry of n.entries) walk(entry);
    }
  };
  walk(node);
  return found;
}

// Every string scalar value under `node` (mapping values and sequence
// entries; keys are not included).
export function stringsUnder(node: YAMLNode | null): string[] {
  const found: string[] = [];
  const walk = (n: YAMLNode | null): void => {
    if (!n) return;
    if (isScalar(n)) {
      if (typeof n.value === "string") found.push(n.value);
    } else if (isMapping(n)) {
      for (const pair of n.pairs) walk(pair.value);
    } else if (isSequence(n)) {
      for (const entry of n.entries) walk(entry);
    }
  };
  walk(node);
  return found;
}
