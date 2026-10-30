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
  id: string;
  name: string;
  kind: "rule" | "variable" | "patterns";
  pair?: YAMLPair;
}

export interface PatternSite {
  owner: Owner;
  key: PatternKey | "value" | "entry";
  scalar: YAMLScalar;
  source: string;
  mapping?: YAMLMapping;
  anchorLines: number[];
}

export interface GrammarIndex {
  root: YAMLMapping | null;
  rules: Map<string, YAMLPair>;
  variables: Map<string, YAMLPair>;
  ruleMappings: { owner: Owner; mapping: YAMLMapping }[];
  patternSites: PatternSite[];
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

  const commentLines = new Map<number, string>();
  for (const comment of sourceCode.getAllComments()) {
    const line = comment.loc?.start.line;
    if (line === undefined) continue;
    const before = (lines[line - 1] ?? "").slice(0, comment.loc!.start.column);
    if (before.trim() !== "") continue;
    commentLines.set(line, comment.value.replace(/^\s/, ""));
  }

  const commentBlockAbove = (line: number): string[] => {
    const block: string[] = [];
    for (let l = line - 1; l >= 1; l--) {
      const text = commentLines.get(l);
      if (text === undefined) break;
      block.unshift(text);
    }
    return block;
  };

  const dashLine = (node: { range: [number, number]; loc: YAMLScalar["loc"] }) => {
    const text = sourceCode.text;
    let i = node.range[0] - 1;
    while (i >= 0 && /\s/.test(text[i]!)) i--;
    if (text[i] !== "-") return node.loc.start.line;
    return sourceCode.getLocFromIndex(i).line;
  };

  const walkRule = (owner: Owner, mapping: YAMLMapping): void => {
    ruleMappings.push({ owner, mapping });
    const ownerLine = owner.pair?.loc.start.line;
    const inSequence = mapping.parent?.type === "YAMLSequence";
    for (const key of PATTERN_KEYS) {
      const pair = findPair(mapping, key);
      if (pair && isScalar(pair.value) && typeof pair.value.value === "string") {
        const anchors = [pair.loc.start.line, mapping.loc.start.line];
        if (inSequence) anchors.push(dashLine(mapping));
        if (ownerLine !== undefined) anchors.push(ownerLine);
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
        const owner: Owner = { id: `variables.${name}`, name, kind: "variable", pair };
        if (isScalar(pair.value) && typeof pair.value.value === "string") {
          patternSites.push({
            owner,
            key: "value",
            scalar: pair.value,
            source: pair.value.value,
            anchorLines: [pair.loc.start.line],
          });
        } else if (isSequence(pair.value)) {
          for (const entry of pair.value.entries) {
            if (!isScalar(entry) || typeof entry.value !== "string") continue;
            patternSites.push({
              owner,
              key: "entry",
              scalar: entry,
              source: entry.value,
              anchorLines: [...new Set([entry.loc.start.line, pair.loc.start.line])],
            });
          }
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
