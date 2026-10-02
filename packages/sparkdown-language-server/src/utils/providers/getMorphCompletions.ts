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
  MORPH_DIRECTIONS,
  MORPH_EASING_KEYWORDS,
  MORPH_FALLBACKS,
  MORPH_FIELD_DOCS,
  MORPH_METHODS,
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

// Keys whose value is a container of further lines rather than a scalar.
const CONTAINER_KEYS = new Set(["layers", "keyframes", "timing", "clips", "between", "targets"]);
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

/** What the caller read from the brace blocks of a morph's body (#1222). */
export interface MorphBraceContext {
  /** The keys of the blocks that hold the cursor, outermost first (`-` for a
   *  list entry's braces), or null when no block holds it. */
  path: string[] | null;
  /** The brace entry being written up to the cursor (`braceEntryAt`), or
   *  null when the cursor is inside a quoted string. */
  entry: string | null;
  /** The innermost key around each `state` property written in a block. */
  stateContainers: string[];
}

/**
 * Completion inside a `morph` block body. Returns null when the cursor is not
 * somewhere this handler owns, so the caller can fall back to its generic
 * struct completion.
 *
 * In a brace block the cursor's path comes from the blocks around it, and a
 * container (a field, a layer label, a keyframe position or container)
 * inserts a balanced `name { }` block with the cursor inside.
 */
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
  // Groups this morph drives: every container with a `state` line, plus the
  // container the cursor is in. Candidates are images with any of them.
  const driven = new Set<string>();
  for (const container of braces?.stateContainers ?? []) {
    if (container !== "-") driven.add(container);
  }
  const inKeyframe = path[0] === "keyframes" && path.length >= 3;
  const container = inKeyframe ? path[path.length - 1]! : undefined;
  if (container) driven.add(container);
  // Groups the morph inherits: every `as` ancestor's keyframes, read from the
  // compiled program, so a child that only restates policies still completes
  // from the images its inherited keyframes bind to.
  const morphs = (context["morph"] ?? {}) as Record<string, any>;
  const seen = new Set<string>();
  let ancestor: string | undefined = morphs[block.name]?.$extends;
  while (typeof ancestor === "string" && !seen.has(ancestor)) {
    seen.add(ancestor);
    const struct = morphs[ancestor];
    if (!struct || typeof struct !== "object") break;
    for (const group of morphRequirements(struct).groups.keys()) {
      driven.add(group);
    }
    ancestor = struct.$extends;
  }
  const candidates = images.filter((image) =>
    [...driven].some((group) => image.vocabulary.groups[group]),
  );
  const labelImages = candidates.length > 0 ? candidates : images;

  const items: CompletionItem[] = [];
  const add = (item: CompletionItem) => {
    if (!items.some((existing) => existing.label === item.label)) items.push(item);
  };
  const docs = (name: string) =>
    MORPH_FIELD_DOCS[name]
      ? { kind: MarkupKind.Markdown, value: MORPH_FIELD_DOCS[name]! }
      : undefined;
  const replaceRange = (length: number) => ({
    start: { line: position.line, character: position.character - length },
    end: position,
  });

  // `key = value` being written: complete the value, separated from a `=`
  // typed without a following space.
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
    // Value choices replace the value typed so far, so they are offered only
    // while it is a plain word (`li`, `eyes.cl`); inside a call such as
    // `steps(1` they would replace the call itself.
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
          // The short form both editors show beside the label.
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

  // A key or list item being written.
  const keyMatch = /^\s*([\w.%-]*)$/.exec(before);
  if (!keyMatch) return [];
  const typed = keyMatch[1]!;
  const labels = new Set(labelImages.flatMap((image) => [...morphImageLabels(image.vocabulary)]));
  // A block's `{ $0 }` is a snippet in both editors: the cursor lands
  // between the braces.
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
  } else {
    return [];
  }
  return items;
}
