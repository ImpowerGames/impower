import { type SyntaxNode, type Tree } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { LowerContext } from "../lower/context";
import type {
  SourceSpan,
  StructSource,
} from "../lower/lowerers/lowerStructBodyTyped";
import { findChildByName } from "../lower/utils/alternatorArms";
import {
  bindMorph,
  groupHasState,
  morphImageLabels,
  morphImages,
} from "./bindMorph";
import { readMorphBody, type MorphIssue } from "./readMorphBody";
import { morphValueProblems, validateMorphDeclaration } from "./validateMorph";

type Context = { [type: string]: { [name: string]: any } };

export interface LocatedMorphIssue extends MorphIssue {
  related?: { uri: string; message: string };
}

export interface MorphScript {
  read: (from: number, to: number) => string;
  position: (offset: number) => { line: number; character: number };
  tree: Tree;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

export function findMorphNodes(tree: Tree): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  tree.iterate({
    enter: (ref) => {
      if (ref.name === "LuauMorph") {
        nodes.push(ref.node);
        return false;
      }
      return undefined;
    },
  });
  return nodes;
}

export interface WrittenMorph {
  uri: string;
  node: SyntaxNode;
  name: string;
  nameNode: SyntaxNode | null;
  own: ReturnType<typeof readMorphBody>;
}

export interface MorphLayer {
  name: string;
  struct: Record<string, unknown>;
  written: boolean;
}

export function compiledAncestor(
  context: Context,
  name: string,
): { struct: Record<string, unknown>; parent?: string } | undefined {
  if (name.startsWith("$")) return undefined;
  const direct = context["morph"]?.[name];
  if (isRecord(direct)) return { struct: direct };
  for (const [type, table] of Object.entries(context)) {
    if (type === "morph" || !isRecord(table)) continue;
    const struct = table[name];
    if (isRecord(struct) && struct["$type"] === type) {
      return { struct, parent: type };
    }
  }
  return undefined;
}

export function morphAncestors(
  name: string,
  written: ReadonlyMap<string, Record<string, unknown>>,
  parents: ReadonlyMap<string, string>,
  context: Context,
): MorphLayer[] {
  const layers: MorphLayer[] = [];
  let unconfirmed: MorphLayer[] = [];
  const seen = new Set<string>([name]);
  let current = parents.get(name);
  while (current && !seen.has(current)) {
    seen.add(current);
    const body = written.get(current);
    if (body) {
      layers.push(...unconfirmed, { name: current, struct: body, written: true });
      unconfirmed = [];
      current = parents.get(current);
      continue;
    }
    const found = compiledAncestor(context, current);
    if (!found) break;
    unconfirmed.push({ name: current, struct: found.struct, written: false });
    if (found.parent === undefined) {
      layers.push(...unconfirmed);
      unconfirmed = [];
      break;
    }
    current = found.parent;
  }
  return layers;
}

export function effectiveMorph(
  base: Record<string, unknown> | undefined,
  ancestors: readonly MorphLayer[],
  own: Record<string, unknown>,
  inherit: (base: any, override: any) => any,
): Record<string, unknown> {
  let result: Record<string, unknown> = isRecord(base) ? base : {};
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    result = inherit(result, ancestors[i]!.struct);
  }
  return inherit(result, own);
}

export function readWrittenMorphs(scripts: readonly (MorphScript & { uri: string })[]): WrittenMorph[] {
  const morphs: WrittenMorph[] = [];
  for (const script of scripts) {
    const ctx: LowerContext = {
      read: script.read,
      lineNumber: (pos) => script.position(pos).line,
      characterNumber: (pos) => script.position(pos).character,
    };
    for (const node of findMorphNodes(script.tree)) {
      const nameNode = getDescendent("LuauDefineName", node);
      morphs.push({
        uri: script.uri,
        node,
        name: nameNode ? script.read(nameNode.from, nameNode.to).trim() : "",
        nameNode: nameNode ?? null,
        own: readMorphBody(findChildByName(node, "LuauMorph_content"), ctx),
      });
    }
  }
  return morphs;
}

export function collectEffectiveMorphs(
  scripts: readonly (MorphScript & { uri: string })[],
  context: Context,
  inherit: (base: any, override: any) => any,
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  const morphs = readWrittenMorphs(scripts).filter((m) => m.name);
  if (morphs.length === 0) return result;
  const written = new Map<string, Record<string, unknown>>();
  const parents = new Map<string, string>();
  for (const morph of morphs) {
    written.set(morph.name, morph.own.struct);
    const parentNode = getDescendent("LuauDefineParentName", morph.node);
    const script = scripts.find((s) => s.uri === morph.uri)!;
    const parent = parentNode ? script.read(parentNode.from, parentNode.to).trim() : "";
    if (parent) parents.set(morph.name, parent);
  }
  const base = (context["morph"] ?? {})["$default"] as Record<string, unknown> | undefined;
  for (const morph of morphs) {
    const ancestors = morphAncestors(morph.name, written, parents, context);
    result.set(morph.name, effectiveMorph(base, ancestors, morph.own.struct, inherit));
  }
  return result;
}

export function collectMorphIssues(
  scripts: readonly (MorphScript & { uri: string })[],
  context: Context,
  inherit: (base: any, override: any) => any,
): Map<string, LocatedMorphIssue[]> {
  const result = new Map<string, LocatedMorphIssue[]>();
  const morphs = readWrittenMorphs(scripts);
  if (morphs.length === 0) return result;
  const images = morphImages(context);
  const written = new Map<string, Record<string, unknown>>();
  const parents = new Map<string, string>();
  const parentSpans = new Map<WrittenMorph, SourceSpan>();
  for (const morph of morphs) {
    const parentNode = getDescendent("LuauDefineParentName", morph.node);
    if (parentNode) parentSpans.set(morph, parentNode);
    if (!morph.name) continue;
    written.set(morph.name, morph.own.struct);
    const script = scripts.find((s) => s.uri === morph.uri)!;
    const parent = parentNode ? script.read(parentNode.from, parentNode.to).trim() : "";
    if (parent) parents.set(morph.name, parent);
  }
  const base = (context["morph"] ?? {})["$default"] as Record<string, unknown> | undefined;
  for (const morph of morphs) {
    const ancestors = morph.name
      ? morphAncestors(morph.name, written, parents, context)
      : [];
    const effective = effectiveMorph(base, ancestors, morph.own.struct, inherit);
    const nameSpan = morph.nameNode ?? {
      from: morph.node.from,
      to: morph.node.from + "morph".length,
    };
    const parentSpan = parentSpans.get(morph);
    const issues = [
      ...validateMorphDeclaration({
        name: nameSpan,
        parent: parentSpan ?? null,
        block: morph.node,
        withKeyword: getDescendent("LuauWithKeyword", morph.node) ?? null,
        own: morph.own,
        effective,
        parentEffective: ancestors[0]?.written
          ? effectiveMorph(base, ancestors.slice(1), ancestors[0].struct, inherit)
          : null,
      }),
      ...coverageIssues(morph.name, nameSpan, morph.own, effective, context, images),
      ...inheritedValueIssues(morph.own.struct, ancestors, parentSpan ?? nameSpan),
    ];
    const parentName = morph.name ? parents.get(morph.name) : undefined;
    if (parentSpan && parentName && ancestors[0]?.name !== parentName) {
      issues.push({
        from: parentSpan.from,
        to: parentSpan.to,
        severity: "warning",
        message: `No morph named \`${parentName}\` to inherit from; this morph inherits only the builtin defaults.`,
      });
    }
    if (issues.length > 0) {
      result.set(morph.uri, [...(result.get(morph.uri) ?? []), ...issues]);
    }
  }
  return result;
}

function sets(obj: unknown, path: string): boolean {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (!isRecord(current) || !(key in current)) return false;
    current = current[key];
  }
  return true;
}

function inheritedValueIssues(
  own: Record<string, unknown>,
  ancestors: readonly MorphLayer[],
  span: SourceSpan,
): LocatedMorphIssue[] {
  const firstWritten = ancestors.findIndex((layer) => layer.written);
  const defines = ancestors.slice(0, firstWritten < 0 ? ancestors.length : firstWritten);
  if (defines.length === 0) return [];
  let merged: Record<string, unknown> = {};
  for (let i = defines.length - 1; i >= 0; i -= 1) {
    const struct = defines[i]!.struct;
    merged = mergeRecords(merged, struct);
  }
  const issues: LocatedMorphIssue[] = [];
  for (const { field, message } of morphValueProblems(merged)) {
    if (sets(own, field)) continue;
    const supplier = defines.find((layer) => sets(layer.struct, field))?.name;
    issues.push({
      from: span.from,
      to: span.to,
      severity: "error",
      message: `\`${field}\`, inherited from \`${supplier ?? defines[0]!.name}\`: ${message}`,
    });
  }
  return issues;
}

function mergeRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key.startsWith("$")) continue;
    const prior = result[key];
    result[key] = isRecord(prior) && isRecord(value) ? mergeRecords(prior, value) : value;
  }
  return result;
}

function coverageIssues(
  name: string,
  nameSpan: { from: number; to: number },
  own: ReturnType<typeof readMorphBody>,
  effective: Record<string, unknown>,
  context: Context,
  images: ReturnType<typeof morphImages>,
): LocatedMorphIssue[] {
  const issues: LocatedMorphIssue[] = [];
  const binding = bindMorph(context, effective, images);
  const { sources } = own;
  const src = (obj: unknown): StructSource | undefined =>
    obj && typeof obj === "object" ? sources.get(obj) : undefined;
  const warn = (
    span: { from: number; to: number } | undefined,
    message: string,
    related?: LocatedMorphIssue["related"],
  ) => {
    const at = span ?? nameSpan;
    issues.push({ from: at.from, to: at.to, message, severity: "warning", related });
  };
  const label = name ? `\`${name}\`` : "This morph";

  const allGroups = new Set(images.flatMap((image) => Object.keys(image.vocabulary.groups)));
  const candidateLabels = new Set<string>();
  const labelSource = binding.candidates.length > 0
    ? binding.candidates.map((c) => c.vocabulary)
    : images.map((image) => image.vocabulary);
  for (const vocabulary of labelSource) {
    for (const l of morphImageLabels(vocabulary)) candidateLabels.add(l);
  }
  const checkLabel = (value: string, span: SourceSpan | undefined) => {
    if (!candidateLabels.has(value)) {
      warn(span, `No image the morph applies to has a layer labelled \`${value}\`.`);
    }
  };
  const keyframes = own.struct["keyframes"];
  if (Array.isArray(keyframes) && images.length > 0) {
    for (const keyframe of keyframes) {
      if (!isRecord(keyframe)) continue;
      for (const [key, container] of Object.entries(keyframe)) {
        if (key === "offset" || !isRecord(container)) continue;
        const state = container["state"];
        if (typeof state === "string" && state && !state.includes(".")) {
          if (!allGroups.has(key)) {
            warn(src(keyframe)?.keys.get(key), `No image has a \`${key}\` attribute group.`);
          } else {
            const having = binding.candidates.filter((c) => c.vocabulary.groups[key]);
            if (!having.some((c) => groupHasState(c.vocabulary, key, state))) {
              warn(
                src(container)?.values.get("state"),
                `No image's \`${key}\` group has a \`${state}\` state.`,
              );
            }
          }
        }
        if (Object.keys(container).some((k) => k !== "state")) {
          checkLabel(key, src(keyframe)?.keys.get(key));
        }
      }
    }
  }
  if (images.length > 0) {
    const layers = own.struct["layers"];
    if (isRecord(layers)) {
      for (const key of Object.keys(layers)) checkLabel(key, src(layers)?.keys.get(key));
    }
    const clips = own.struct["clips"];
    if (Array.isArray(clips)) {
      for (const clip of clips) {
        if (!isRecord(clip)) continue;
        for (const field of ["between", "targets"]) {
          const list = clip[field];
          if (!Array.isArray(list)) continue;
          list.forEach((value, i) => {
            if (typeof value === "string" && value) {
              checkLabel(value, src(list)?.itemValues[i] ?? src(list)?.items[i]);
            }
          });
        }
      }
    }
  }

  for (const candidate of binding.candidates) {
    const related = candidate.uri
      ? { uri: candidate.uri, message: `Artwork for \`${candidate.image}\`` }
      : undefined;
    if (candidate.missingGroups.length > 0) {
      warn(
        nameSpan,
        `${label} does not apply to image \`${candidate.image}\`: it has no ${candidate.missingGroups.map((g) => `\`${g}\``).join(" or ")} group. A morph applies only to images with every group it drives.`,
        related,
      );
    }
    for (const { group, state } of candidate.missingStates) {
      warn(
        nameSpan,
        `${label} does not apply to image \`${candidate.image}\`: its \`${group}\` group has no \`${state}\` state.`,
        related,
      );
    }
    for (const variant of candidate.variants) {
      if (variant.status !== "skipped") continue;
      warn(
        nameSpan,
        `${label} does not apply to \`${variant.name}\`: ${variant.problems.map((p) => p.message).join("; ")}.`,
        related,
      );
    }
  }
  return issues;
}
