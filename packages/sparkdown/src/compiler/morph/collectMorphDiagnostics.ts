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
import { ambiguousSpeechMorphs } from "../../morph/channel";
import type { MorphProgramChannel } from "../../morph/types";
import { parseMorphQualifiedState, withoutMorphOwnFields } from "./morphSchema";
import { plainPoseStates, poseStateProblems, readMorphBody, type MorphIssue } from "./readMorphBody";
import { validateMorphDeclaration, type MorphDeclaration } from "./validateMorph";

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
  if (isRecord(direct)) return { struct: plainPoseStates(direct) };
  for (const [type, table] of Object.entries(context)) {
    if (type === "morph" || !isRecord(table)) continue;
    const struct = table[name];
    if (isRecord(struct) && struct["$type"] === type) {
      return { struct: plainPoseStates(struct), parent: type };
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
  return inherit(withoutMorphOwnFields(result), own);
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
  declared: Context,
  channel?: MorphProgramChannel,
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
    const parentEffective = ancestors[0]?.written
      ? effectiveMorph(base, ancestors.slice(1), ancestors[0].struct, inherit)
      : null;
    const issues = [
      ...validateWithUnwrittenParents(
        {
          name: nameSpan,
          parent: parentSpan ?? null,
          block: morph.node,
          own: morph.own,
          effective,
          parentEffective,
          timingWritten: writtenTimingFields(ancestors, morph.own.struct, declared),
        },
        ancestors,
        parentSpan ?? nameSpan,
        inherit,
      ),
      ...coverageIssues(morph.name, nameSpan, morph.own, effective, context, images, {
        span: parentSpan ?? nameSpan,
        ancestors,
        parentEffective,
      }),
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
  for (const issue of ambiguityIssues(morphs, context, channel)) {
    result.set(issue.uri, [...(result.get(issue.uri) ?? []), issue.issue]);
  }
  return result;
}

function ambiguityIssues(
  morphs: readonly WrittenMorph[],
  context: Context,
  channel: MorphProgramChannel | undefined,
): { uri: string; issue: LocatedMorphIssue }[] {
  const byMorph = new Map<string, { image: string; cluster: string[]; images: Set<string> }>();
  for (const variant of Object.keys(channel?.picks ?? {})) {
    for (const cluster of ambiguousSpeechMorphs(context, channel, { $name: variant })) {
      for (const name of cluster) {
        const entry = byMorph.get(name) ?? { image: variant, cluster, images: new Set<string>() };
        entry.images.add(variant);
        byMorph.set(name, entry);
      }
    }
  }
  const quote = (names: readonly string[]) =>
    names.length > 1 ? `${names.slice(0, -1).map((n) => `\`${n}\``).join(", ")} and \`${names.at(-1)}\`` : `\`${names[0]}\``;
  const found: { uri: string; issue: LocatedMorphIssue }[] = [];
  for (const morph of morphs) {
    const entry = morph.name ? byMorph.get(morph.name) : undefined;
    if (!entry) continue;
    const { image, cluster, images } = entry;
    const marked = cluster.filter((name) => channel?.speech?.[name]?.default);
    const why = marked.length === 0 ? "none is marked `default = true`" : `${quote(marked)} are all marked \`default = true\``;
    const more = images.size > 1 ? ` (and ${images.size - 1} more)` : "";
    const message = `${quote(cluster)} play on \`${image}\`${more} and drive the same group, and ${why}: nothing plays there unless a directive picks one with a \`morph\` clause. Mark exactly one of them \`default = true\`.`;
    const at = morph.nameNode ?? { from: morph.node.from, to: morph.node.from + "morph".length };
    found.push({ uri: morph.uri, issue: { from: at.from, to: at.to, severity: "warning", message } });
  }
  return found;
}

function writtenTimingFields(
  ancestors: readonly MorphLayer[],
  own: Record<string, unknown>,
  declared: Context,
): Set<string> {
  const fields = new Set<string>();
  for (const layer of [{ name: "", struct: own, written: true }, ...ancestors]) {
    const timing = (layer.written ? layer.struct : compiledAncestor(declared, layer.name)?.struct)?.["timing"];
    if (isRecord(timing)) for (const field of Object.keys(timing)) fields.add(field);
  }
  return fields;
}

function validateWithUnwrittenParents(
  decl: MorphDeclaration,
  ancestors: readonly MorphLayer[],
  span: SourceSpan,
  inherit: (base: any, override: any) => any,
): LocatedMorphIssue[] {
  const firstWritten = ancestors.findIndex((layer) => layer.written);
  const defines = ancestors.slice(0, firstWritten < 0 ? ancestors.length : firstWritten);
  if (defines.length === 0) return validateMorphDeclaration(decl);
  let merged: Record<string, unknown> = {};
  for (let i = defines.length - 1; i >= 0; i -= 1) merged = inherit(merged, defines[i]!.struct);
  const own = decl.own.struct;
  const inherited = inheritedFields(withoutMorphOwnFields(merged), own);
  if (Object.keys(inherited).length === 0) return validateMorphDeclaration(decl);
  const supplier = (field: string) => defines.find((layer) => Object.hasOwn(layer.struct, field))?.name ?? defines[0]!.name;
  const aliases = new WeakMap<object, { written: object; unwritten: Set<string> }>();
  const fromParent = new WeakSet<object>();
  const mark = (value: unknown) => {
    if (!value || typeof value !== "object" || fromParent.has(value)) return;
    fromParent.add(value);
    for (const child of Object.values(value)) mark(child);
  };
  const combine = (written: Record<string, unknown>, from: Record<string, unknown>): Record<string, unknown> => {
    const combined: Record<string, unknown> = { ...written };
    const unwritten = new Set<string>();
    for (const [key, value] of Object.entries(from)) {
      const mine = Object.hasOwn(written, key) ? written[key] : undefined;
      if (isRecord(mine) && isRecord(value)) {
        combined[key] = combine(mine, value);
      } else if (!Object.hasOwn(written, key)) {
        mark(value);
        combined[key] = value;
        unwritten.add(key);
      }
    }
    aliases.set(combined, { written, unwritten });
    return combined;
  };
  const struct = combine(own, inherited);
  const everywhere = { get: () => span } as unknown as Map<string, SourceSpan>;
  const everyItem = new Proxy([] as SourceSpan[], {
    get: (target, prop) => (typeof prop === "string" && /^[0-9]+$/.test(prop) ? span : Reflect.get(target, prop)),
  });
  const atParent: StructSource = { line: span, keys: everywhere, values: everywhere, lines: everywhere, items: everyItem, itemValues: everyItem };
  const base = decl.own.sources;
  const combinedSources = new WeakMap<object, StructSource>();
  const combinedSource = (obj: object, alias: { written: object; unwritten: Set<string> }): StructSource => {
    const known = combinedSources.get(obj);
    if (known) return known;
    const own = base.get(alias.written);
    const lookup = (map: Map<string, SourceSpan> | undefined) =>
      ({ get: (key: string) => map?.get(key) ?? (alias.unwritten.has(key) ? span : undefined) }) as Map<string, SourceSpan>;
    const source: StructSource = {
      ...(own?.line ? { line: own.line } : {}),
      keys: lookup(own?.keys),
      values: lookup(own?.values),
      lines: lookup(own?.lines),
      items: own?.items ?? [],
      itemValues: own?.itemValues ?? [],
    };
    combinedSources.set(obj, source);
    return source;
  };
  const sources = {
    get: (obj: object) => {
      if (fromParent.has(obj)) return atParent;
      const alias = aliases.get(obj);
      return alias ? combinedSource(obj, alias) : base.get(obj);
    },
  } as WeakMap<object, StructSource>;
  const issues: LocatedMorphIssue[] = validateMorphDeclaration({ ...decl, own: { ...decl.own, struct, sources } });
  for (const { group, keyframe, message } of poseStateProblems(inherited)) {
    const label = keyframe === undefined ? `\`rest.${group}.state\`` : `\`keyframes\` (keyframe ${keyframe + 1})`;
    const field = keyframe === undefined ? "rest" : "keyframes";
    issues.push({ from: span.from, to: span.to, severity: "error", message: `${label}, inherited from \`${supplier(field)}\`: ${message}` });
  }
  return issues;
}

function inheritedFields(
  effective: Record<string, unknown>,
  own: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(effective)) {
    if (key.startsWith("$")) continue;
    if (!Object.hasOwn(own, key)) {
      result[key] = value;
      continue;
    }
    const written = own[key];
    if (isRecord(value) && isRecord(written)) {
      const nested = inheritedFields(value, written);
      if (Object.keys(nested).length > 0) result[key] = nested;
    }
  }
  return result;
}

type FieldWarn = (field: string, span: SourceSpan | undefined, message: string) => void;

function fieldWarnings(
  struct: Record<string, unknown>,
  binding: ReturnType<typeof bindMorph>,
  images: ReturnType<typeof morphImages>,
  label: string,
  src: (obj: unknown) => StructSource | undefined,
  warn: FieldWarn,
): void {
  const allGroups = new Set(images.flatMap((image) => Object.keys(image.vocabulary.groups)));
  const candidateLabels = new Set<string>();
  const labelSource = binding.candidates.length > 0
    ? binding.candidates.map((c) => c.vocabulary)
    : images.map((image) => image.vocabulary);
  for (const vocabulary of labelSource) {
    for (const l of morphImageLabels(vocabulary)) candidateLabels.add(l);
  }
  const checkLabel = (field: string, value: string, span: SourceSpan | undefined) => {
    if (!candidateLabels.has(value)) {
      warn(field, span, `No image the morph applies to has a layer labelled \`${value}\`.`);
    }
  };
  const keyframes = struct["keyframes"];
  if (Array.isArray(keyframes) && images.length > 0) {
    for (const keyframe of keyframes) {
      if (!isRecord(keyframe)) continue;
      for (const [key, container] of Object.entries(keyframe)) {
        if (key === "offset" || !isRecord(container)) continue;
        const state = container["state"];
        if (typeof state === "string" && state && !state.includes(".")) {
          if (!allGroups.has(key)) {
            warn("keyframes", src(keyframe)?.keys.get(key), `No image has a \`${key}\` attribute group.`);
          } else {
            const having = binding.candidates.filter((c) => c.vocabulary.groups[key]);
            if (!having.some((c) => groupHasState(c.vocabulary, key, state))) {
              warn(
                "keyframes",
                src(container)?.values.get("state"),
                `No image's \`${key}\` group has a \`${state}\` state.`,
              );
            }
          }
        }
        if (Object.keys(container).some((k) => k !== "state")) {
          checkLabel("keyframes", key, src(keyframe)?.keys.get(key));
        }
      }
    }
  }
  const rest = struct["rest"];
  if (isRecord(rest) && images.length > 0) {
    for (const [group, container] of Object.entries(rest)) {
      const state = isRecord(container) ? container["state"] : undefined;
      if (typeof state !== "string" || !state || state.includes(".")) continue;
      const having = binding.candidates.filter((c) => c.vocabulary.groups[group]);
      if (having.length > 0 && !having.some((c) => groupHasState(c.vocabulary, group, state))) {
        warn(`rest.${group}`, src(container)?.values.get("state"), `No image's \`${group}\` group has a \`${state}\` state.`);
      }
    }
  }
  const conditionVocabularies = binding.candidates.length > 0 ? binding.candidates.map((c) => c.vocabulary) : images.map((image) => image.vocabulary);
  for (const field of ["when", "unless"]) {
    const value = struct[field];
    const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (images.length === 0) break;
    list.forEach((item, index) => {
      const condition = parseMorphQualifiedState(item);
      if (!condition) return;
      const span = Array.isArray(value)
        ? (src(value)?.itemValues[index] ?? src(value)?.items[index])
        : src(struct)?.values.get(field);
      const having = conditionVocabularies.filter((vocabulary) => vocabulary.groups[condition.group]);
      if (having.length === 0) {
        warn(field, span, `No image ${label} could play on has a \`${condition.group}\` attribute group.`);
      } else if (!having.some((vocabulary) => groupHasState(vocabulary, condition.group, condition.state))) {
        warn(field, span, `No image's \`${condition.group}\` group has a \`${condition.state}\` state.`);
      }
    });
  }
  if (images.length > 0) {
    const layers = struct["layers"];
    if (isRecord(layers)) {
      for (const key of Object.keys(layers)) {
        if (key.startsWith("$")) continue;
        const field = `layers.${key}`;
        checkLabel(field, key, src(layers)?.keys.get(key));
        const policy = layers[key];
        const partner = isRecord(policy) ? policy["partner"] : undefined;
        if (typeof partner === "string" && partner) checkLabel(field, partner, src(policy)?.values.get("partner"));
        if (Array.isArray(partner)) {
          partner.forEach((value, i) => {
            if (typeof value === "string" && value) checkLabel(field, value, src(partner)?.itemValues[i] ?? src(partner)?.items[i]);
          });
        }
      }
    }
    const clips = struct["clips"];
    if (Array.isArray(clips)) {
      for (const clip of clips) {
        if (!isRecord(clip)) continue;
        for (const field of ["between", "targets"]) {
          const list = clip[field];
          if (!Array.isArray(list)) continue;
          list.forEach((value, i) => {
            if (typeof value === "string" && value) {
              checkLabel("clips", value, src(list)?.itemValues[i] ?? src(list)?.items[i]);
            }
          });
        }
      }
    }
  }
}

function coverageIssues(
  name: string,
  nameSpan: { from: number; to: number },
  own: ReturnType<typeof readMorphBody>,
  effective: Record<string, unknown>,
  context: Context,
  images: ReturnType<typeof morphImages>,
  inheritance: {
    span: SourceSpan;
    ancestors: readonly MorphLayer[];
    parentEffective: Record<string, unknown> | null;
  },
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

  fieldWarnings(own.struct, binding, images, label, src, (_field, span, message) => warn(span, message));

  const inherited = inheritedFields(effective, own.struct);
  if (Object.keys(inherited).length > 0) {
    const reported = new Set<string>();
    const { parentEffective } = inheritance;
    if (parentEffective) {
      fieldWarnings(parentEffective, bindMorph(context, parentEffective, images), images, label, () => undefined, (field, _span, message) =>
        reported.add(`${field}\n${message}`),
      );
    }
    fieldWarnings(inherited, binding, images, label, () => undefined, (field, _span, message) => {
      const key = `${field}\n${message}`;
      if (reported.has(key)) return;
      reported.add(key);
      const top = field.split(".")[0]!;
      const supplier = inheritance.ancestors.find((layer) => Object.hasOwn(layer.struct, top))?.name;
      warn(inheritance.span, `\`${field}\`, inherited${supplier ? ` from \`${supplier}\`` : ""}: ${message}`);
    });
  }

  for (const candidate of binding.candidates) {
    if (candidate.excluded) continue;
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
