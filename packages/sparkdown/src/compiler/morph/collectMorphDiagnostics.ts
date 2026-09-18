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
import { validateMorphDeclaration } from "./validateMorph";

type Context = { [type: string]: { [name: string]: any } };

/** A morph issue with the related artwork it concerns, if any. */
export interface LocatedMorphIssue extends MorphIssue {
  related?: { uri: string; message: string };
}

export interface MorphScript {
  read: (from: number, to: number) => string;
  /** 0-based line and character of an offset. */
  position: (offset: number) => { line: number; character: number };
  tree: Tree;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

/** Every `morph` block in a syntax tree. */
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

/** A morph block as written: its name, node and own body. */
export interface WrittenMorph {
  uri: string;
  node: SyntaxNode;
  name: string;
  nameNode: SyntaxNode | null;
  own: ReturnType<typeof readMorphBody>;
}

/**
 * The morph as the engine sees it: the type's `$default`, then every
 * `as PARENT` ancestor from the farthest to the nearest, then the morph's own
 * body, each layer overriding the one before. This is the order the runtime's
 * `__index` chain reads fields in. It is built from the bodies as written,
 * because the compiled context already merges `$default` into every morph,
 * which would let a default hide a value the parent supplies.
 */
export function effectiveMorph(
  written: ReadonlyMap<string, Record<string, unknown>>,
  parents: ReadonlyMap<string, string>,
  base: Record<string, unknown> | undefined,
  name: string,
  inherit: (base: any, override: any) => any,
): Record<string, unknown> {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let current: string | undefined = name;
  while (current && !seen.has(current) && written.has(current)) {
    seen.add(current);
    chain.unshift(written.get(current)!);
    current = parents.get(current);
  }
  let result: Record<string, unknown> = isRecord(base) ? base : {};
  for (const body of chain) result = inherit(result, body);
  return result;
}

/** Read every morph block in the scripts. */
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

/**
 * Check every morph declared in the scripts against its inherited struct and
 * the program's artwork, returning the issues for each script.
 *
 * Structural problems are errors placed on the text that causes them. Artwork
 * coverage is a warning: a group, state or label no candidate image has is
 * reported where it is written, and a candidate that lacks some of what the
 * morph drives, or a variant that cannot rest where the morph starts, is
 * reported on the morph's name with a link to the image. Images with none of
 * the morph's groups are not candidates and stay silent.
 */
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
  for (const morph of morphs) {
    if (!morph.name) continue;
    written.set(morph.name, morph.own.struct);
    const parentNode = getDescendent("LuauDefineParentName", morph.node);
    const script = scripts.find((s) => s.uri === morph.uri)!;
    const parent = parentNode ? script.read(parentNode.from, parentNode.to).trim() : "";
    if (parent) parents.set(morph.name, parent);
  }
  const base = (context["morph"] ?? {})["$default"];
  for (const morph of morphs) {
    const effective = morph.name
      ? effectiveMorph(written, parents, base, morph.name, inherit)
      : inherit(isRecord(base) ? base : {}, morph.own.struct);
    const nameSpan = morph.nameNode ?? {
      from: morph.node.from,
      to: morph.node.from + "morph".length,
    };
    const issues = [
      ...validateMorphDeclaration({
        name: nameSpan,
        block: morph.node,
        withKeyword: getDescendent("LuauWithKeyword", morph.node) ?? null,
        own: morph.own,
        effective,
      }),
      ...coverageIssues(morph.name, nameSpan, morph.own, effective, context, images),
    ];
    if (issues.length > 0) {
      result.set(morph.uri, [...(result.get(morph.uri) ?? []), ...issues]);
    }
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

  // Artwork coverage of what this declaration writes.
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

  // Candidates that cannot take the morph, reported on its name.
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
