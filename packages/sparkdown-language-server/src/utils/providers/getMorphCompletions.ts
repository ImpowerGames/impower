import { compiledAncestor } from "@impower/sparkdown/src/compiler/morph/collectMorphDiagnostics";
import {
  groupHasState,
  morphImageLabels,
  morphImages,
  morphRequirements,
} from "@impower/sparkdown/src/compiler/morph/bindMorph";
import {
  MORPH_BLENDS,
  MORPH_CLIP_FIELDS,
  MORPH_CONTAINER_FIELDS,
  MORPH_DEPTH_REST,
  MORPH_DIRECTIONS,
  MORPH_EASING_KEYWORDS,
  MORPH_FALLBACKS,
  MORPH_FIELD_DOCS,
  MORPH_METHODS,
  MORPH_PAINT_FIELDS,
  MORPH_POLICY_FIELDS,
  MORPH_ROOT_FIELDS,
  MORPH_TIMING_FIELDS,
} from "@impower/sparkdown/src/compiler/morph/morphSchema";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { entryInsideQuote } from "@impower/sparkdown/src/compiler/utils/braceBlocks";
import {
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  type CompletionItem,
  type Position,
} from "vscode-languageserver";

const CONTAINER_KEYS = new Set(["layers", "keyframes", "timing", "clips", "paints", "between", "targets"]);
const KEYFRAME_POSITIONS = ["from", "to"];

const VALUE_CHOICES: Record<string, readonly string[]> = {
  blend: MORPH_BLENDS,
  method: MORPH_METHODS,
  fallback: MORPH_FALLBACKS,
  direction: MORPH_DIRECTIONS,
  easing: MORPH_EASING_KEYWORDS,
  iterations: ["infinite"],
};

const EASING_FUNCTIONS = [
  { label: "steps()", insert: "steps(${1:3})" },
  { label: "cubic-bezier()", insert: "cubic-bezier(${1:0.25}, ${2:0.1}, ${3:0.25}, ${4:1})" },
  { label: "linear()", insert: "linear(${1:0}, ${2:1})" },
];

export interface MorphBraceContext {
  path: string[] | null;
  entry: string | null;
  states: { container: string; state: string }[];
  keyframes: boolean;
}

export function getMorphCompletions(
  getLineText: (line: number) => string,
  block: { startLine: number; endLine: number; name: string },
  program: SparkProgram | undefined,
  position: Position,
  braces?: MorphBraceContext,
): CompletionItem[] | null {
  if (position.line <= block.startLine || position.line >= block.endLine) {
    return null;
  }
  const lineBefore = getLineText(position.line).slice(0, position.character);
  const before = braces?.path != null ? (braces.entry ?? '"') : lineBefore;
  if (entryInsideQuote(before)) return [];
  const path = braces?.path ?? [];
  const containerSuffix = " { $0 }";

  const context = program?.context ?? {};
  const images = morphImages(context);
  const driven = new Set<string>();
  const named = new Map<string, string[]>();
  const addNamed = (group: string, written: unknown) => {
    if (typeof written !== "string" || !written) return;
    const state = written.startsWith(`${group}.`) ? written.slice(group.length + 1) : written;
    if (state.includes(".")) return;
    const list = named.get(group) ?? [];
    if (!list.includes(state)) list.push(state);
    named.set(group, list);
  };
  for (const { container, state } of braces?.states ?? []) {
    if (container === "-") continue;
    driven.add(container);
    addNamed(container, state);
  }
  let posesFound = !!braces?.keyframes;
  const inKeyframe = path[0] === "keyframes" && path.length >= 3;
  const container = inKeyframe ? path[path.length - 1]! : undefined;
  if (container) driven.add(container);
  const morphs = (context["morph"] ?? {}) as Record<string, any>;
  let keyframeStruct: Record<string, unknown> | undefined = braces?.keyframes ? morphs[block.name] : undefined;
  const seen = new Set<string>();
  let ancestor: string | undefined = morphs[block.name]?.$extends;
  while (typeof ancestor === "string" && !seen.has(ancestor)) {
    seen.add(ancestor);
    const found = compiledAncestor(context, ancestor);
    if (!found) break;
    const struct = found.struct as Record<string, any>;
    for (const group of morphRequirements(struct).groups.keys()) {
      driven.add(group);
    }
    const keyframes = Array.isArray(struct["keyframes"]) ? struct["keyframes"] : [];
    if (!posesFound && keyframes.length > 0) {
      posesFound = true;
      keyframeStruct = struct;
      for (const keyframe of keyframes) {
        for (const [group, pose] of Object.entries(keyframe ?? {})) {
          addNamed(group, (pose as Record<string, unknown> | null)?.["state"]);
        }
      }
    }
    ancestor = found.parent ?? struct["$extends"];
  }
  const candidates = images.filter((image) =>
    [...driven].some((group) => image.vocabulary.groups[group]),
  );
  const labelImages = candidates.length > 0 ? candidates : images;

  const items: CompletionItem[] = [];
  const add = (item: CompletionItem) => {
    if (!items.some((existing) => existing.label === item.label)) items.push(item);
  };
  const inPaint = path[0] === "paints";
  const docs = (name: string) => {
    const doc = (inPaint ? MORPH_FIELD_DOCS[`paints.${name}`] : undefined) ?? MORPH_FIELD_DOCS[name];
    return doc ? { kind: MarkupKind.Markdown, value: doc } : undefined;
  };
  const replaceRange = (length: number) => ({
    start: { line: position.line, character: position.character - length },
    end: position,
  });

  const scalar = /^\s*([\w-]+)\s*=\s*(\S*)$/.exec(before);
  if (scalar && before.endsWith("=")) {
    const spaced = getMorphCompletions(
      (line) => (line === position.line ? `${before} ` : getLineText(line)),
      block,
      program,
      { line: position.line, character: position.character + 1 },
      braces && braces.entry != null
        ? { ...braces, entry: `${braces.entry} ` }
        : braces,
    );
    return (spaced ?? []).map((item) =>
      item.textEdit && "range" in item.textEdit
        ? {
            ...item,
            textEdit: {
              range: { start: position, end: position },
              newText: ` ${item.textEdit.newText}`,
            },
          }
        : item,
    );
  }
  if (scalar) {
    const [, key, typed] = scalar as unknown as [string, string, string];
    if (!/^[\w.-]*$/.test(typed)) return [];
    if (key === "state" && container) {
      const dot = typed.lastIndexOf(".");
      const group = dot >= 0 ? typed.slice(0, dot) : container;
      const partial = dot >= 0 ? typed.slice(dot + 1) : typed;
      const having = candidates.filter((image) => image.vocabulary.groups[group]);
      const states = new Set(having.flatMap((image) => image.vocabulary.groups[group]!.options));
      for (const state of states) {
        const covering = having.filter((image) =>
          groupHasState(image.vocabulary, group, state),
        );
        const everywhere = covering.length === candidates.length;
        const detail = everywhere
          ? `${group} state in every candidate image`
          : `${group} state in ${covering.length} of ${candidates.length} candidate images: ${covering.map((c) => c.name).join(", ")}`;
        add({
          label: state,
          kind: CompletionItemKind.EnumMember,
          detail,
          labelDetails: {
            description: everywhere
              ? "all images"
              : `${covering.length} of ${candidates.length} images`,
          },
          textEdit: { range: replaceRange(partial.length), newText: state },
        });
      }
      return items;
    }
    if (inPaint && (key === "state" || key === "when")) {
      const dot = typed.indexOf(".");
      const states = new Map<string, string[]>();
      if (key === "state") {
        const start = keyframeStruct ? morphRequirements(keyframeStruct).rest : new Map<string, string>();
        for (const [group, list] of named) states.set(group, list.filter((state) => state !== start.get(group)));
      } else {
        for (const image of candidates) {
          for (const [group, { options }] of Object.entries(image.vocabulary.groups)) {
            if (driven.has(group)) continue;
            states.set(group, [...new Set([...(states.get(group) ?? []), ...options])]);
          }
        }
      }
      const choices =
        dot >= 0
          ? (states.get(typed.slice(0, dot)) ?? []).map((state) => ({ label: state, length: typed.length - dot - 1 }))
          : [...states].flatMap(([group, list]) => list.map((s) => ({ label: `${group}.${s}`, length: typed.length })));
      for (const { label, length } of choices) {
        add({
          label,
          kind: CompletionItemKind.EnumMember,
          detail: key,
          documentation: docs(key),
          textEdit: { range: replaceRange(length), newText: label },
        });
      }
      return items;
    }
    const policyPlace = path.length === 0 || (path[0] === "layers" && path.length === 2);
    if (key === "depth" && policyPlace) {
      const dot = typed.indexOf(".");
      const choices =
        dot >= 0
          ? (named.get(typed.slice(0, dot)) ?? []).map((state) => ({ label: state, length: typed.length - dot - 1 }))
          : [MORPH_DEPTH_REST, ...[...named].flatMap(([group, states]) => states.map((s) => `${group}.${s}`))].map(
              (label) => ({ label, length: typed.length }),
            );
      for (const { label, length } of choices) {
        add({
          label,
          kind: CompletionItemKind.EnumMember,
          detail: "depth",
          documentation: docs("depth"),
          textEdit: { range: replaceRange(length), newText: label },
        });
      }
      return items;
    }
    const choices = VALUE_CHOICES[key];
    if (choices) {
      for (const choice of choices) {
        add({
          label: choice,
          kind: CompletionItemKind.EnumMember,
          detail: key,
          documentation: docs(key),
          textEdit: { range: replaceRange(typed.length), newText: choice },
        });
      }
      if (key === "easing") {
        for (const fn of EASING_FUNCTIONS) {
          add({
            label: fn.label,
            kind: CompletionItemKind.Function,
            detail: "easing",
            insertTextFormat: InsertTextFormat.Snippet,
            textEdit: { range: replaceRange(typed.length), newText: fn.insert },
          });
        }
      }
      return items;
    }
    return [];
  }

  const keyMatch = /^\s*([\w.%-]*)$/.exec(before);
  if (!keyMatch) return [];
  const typed = keyMatch[1]!;
  const labels = new Set(labelImages.flatMap((image) => [...morphImageLabels(image.vocabulary)]));
  const snippet = (suffix: string) =>
    suffix.includes("$0") ? { insertTextFormat: InsertTextFormat.Snippet } : {};
  const addField = (name: string) => {
    const container = CONTAINER_KEYS.has(name);
    add({
      label: name,
      kind: CompletionItemKind.Property,
      documentation: docs(name),
      textEdit: {
        range: replaceRange(typed.length),
        newText: container ? `${name}${containerSuffix}` : `${name} = `,
      },
      ...(container ? snippet(containerSuffix) : {}),
      command: container
        ? undefined
        : { title: "Suggest", command: "editor.action.triggerSuggest" },
    });
  };
  const addLabel = (label: string, suffix: string, detail: string) =>
    add({
      label,
      kind: CompletionItemKind.EnumMember,
      detail,
      textEdit: { range: replaceRange(typed.length), newText: `${label}${suffix}` },
      ...snippet(suffix),
    });

  const [first, second, third, fourth] = path;
  if (path.length === 0) {
    MORPH_ROOT_FIELDS.forEach(addField);
  } else if (first === "timing" && path.length === 1) {
    MORPH_TIMING_FIELDS.forEach(addField);
  } else if (first === "layers" && path.length === 1) {
    for (const label of labels) addLabel(label, containerSuffix, "layer label");
  } else if (first === "layers" && path.length === 2) {
    MORPH_POLICY_FIELDS.forEach(addField);
  } else if (first === "keyframes" && path.length === 1) {
    for (const position of KEYFRAME_POSITIONS) {
      add({
        label: position,
        kind: CompletionItemKind.Keyword,
        detail: "keyframe position",
        textEdit: {
          range: replaceRange(typed.length),
          newText: `${position}${containerSuffix}`,
        },
        ...snippet(containerSuffix),
      });
    }
  } else if (
    first === "keyframes" &&
    path.length === 2
  ) {
    if (second === "-") addField("offset");
    const groups = new Set(
      (candidates.length > 0 ? candidates : images).flatMap((image) =>
        Object.keys(image.vocabulary.groups),
      ),
    );
    for (const group of groups) addLabel(group, containerSuffix, "attribute group");
    for (const label of labels) addLabel(label, containerSuffix, "layer label");
  } else if (first === "keyframes" && path.length === 3) {
    MORPH_CONTAINER_FIELDS.forEach(addField);
  } else if (first === "clips" && (path.length === 1 || (path.length === 2 && second === "-"))) {
    MORPH_CLIP_FIELDS.forEach(addField);
  } else if (
    first === "clips" &&
    second === "-" &&
    (third === "between" || third === "targets") &&
    (path.length === 3 || fourth === "-")
  ) {
    for (const label of labels) addLabel(label, "", "layer label");
  } else if (first === "paints" && (path.length === 1 || (path.length === 2 && second === "-"))) {
    MORPH_PAINT_FIELDS.forEach(addField);
  } else if (first === "paints" && second === "-" && third === "targets" && (path.length === 3 || fourth === "-")) {
    for (const label of labels) addLabel(label, "", "layer label");
  } else {
    return [];
  }
  return items;
}
