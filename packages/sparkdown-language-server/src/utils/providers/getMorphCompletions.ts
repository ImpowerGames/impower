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

interface Line {
  indent: number;
  text: string;
}

/** A line's key: `key:` / `key = …` / `- key:`; `-` for a bare list item. */
function lineKeys(text: string): string[] {
  const trimmed = text.trim();
  const item = /^-\s*(.*)$/.exec(trimmed);
  if (item) {
    const rest = item[1]!;
    const inner = /^([^\s:=]+)\s*(?::|=)/.exec(rest);
    return inner ? ["-", inner[1]!] : ["-"];
  }
  const key = /^([^\s:=]+)\s*(?::|=)/.exec(trimmed);
  return key ? [key[1]!] : [];
}

/**
 * The container keys enclosing `lineIndex`, outermost first, read from
 * indentation the way the struct body is parsed: each shallower line above is
 * a parent. A `-` item is its own level; a collapsed `- eyes:` item is the item
 * then its first key.
 */
function pathAt(lines: Line[], lineIndex: number, indent: number): string[] {
  const path: string[] = [];
  let limit = indent;
  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (!line.text.trim() || /^\s*(?:--|\/\/)/.test(line.text)) continue;
    if (line.indent >= limit) continue;
    const keys = lineKeys(line.text);
    if (keys[0] === "-" && keys.length > 1) {
      // A collapsed item carries its first entry on the dash line. A line at
      // that entry's column is the entry's sibling inside the item; a deeper
      // line is the entry's child.
      const entryColumn = line.indent + line.text.trim().indexOf(keys[1]!);
      path.unshift(...(limit > entryColumn ? keys : ["-"]));
    } else {
      path.unshift(...keys);
    }
    limit = line.indent;
  }
  return path;
}

/**
 * Completion inside a `morph` block body. Returns null when the cursor is not
 * somewhere this handler owns, so the caller can fall back to its generic
 * struct completion.
 */
export function getMorphCompletions(
  getLineText: (line: number) => string,
  block: { startLine: number; endLine: number; name: string },
  program: SparkProgram | undefined,
  position: Position,
): CompletionItem[] | null {
  if (position.line <= block.startLine || position.line >= block.endLine) {
    return null;
  }
  const lines: Line[] = [];
  for (let i = block.startLine + 1; i < block.endLine; i += 1) {
    const text = getLineText(i);
    lines.push({ indent: /^[ \t]*/.exec(text)![0].length, text });
  }
  const index = position.line - block.startLine - 1;
  const before = getLineText(position.line).slice(0, position.character);
  const indent = /^[ \t]*/.exec(before)![0].length;
  const path = pathAt(lines, index, indent);

  const context = program?.context ?? {};
  const images = morphImages(context);
  // Groups this morph drives: every container with a `state` line, plus the
  // container the cursor is in. Candidates are images with any of them.
  const driven = new Set<string>();
  lines.forEach((line, i) => {
    if (/^\s*state\s*=/.test(line.text)) {
      const container = pathAt(lines, i, line.indent).at(-1);
      if (container && container !== "-") driven.add(container);
    }
  });
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
  const scalar = /^\s*(?:-\s*)?([\w-]+)\s*=\s*(\S*)$/.exec(before);
  if (scalar && before.endsWith("=")) {
    const spaced = getMorphCompletions(
      (line) => (line === position.line ? `${before} ` : getLineText(line)),
      block,
      program,
      { line: position.line, character: position.character + 1 },
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
  const keyMatch = /^\s*(-\s*)?([\w.%-]*)$/.exec(before);
  if (!keyMatch) return [];
  const dashed = Boolean(keyMatch[1]);
  const typed = keyMatch[2]!;
  const labels = new Set(labelImages.flatMap((image) => [...morphImageLabels(image.vocabulary)]));
  const addField = (name: string) => {
    const container = CONTAINER_KEYS.has(name);
    add({
      label: name,
      kind: CompletionItemKind.Property,
      documentation: docs(name),
      textEdit: {
        range: replaceRange(typed.length),
        newText: container ? `${name}:` : `${name} = `,
      },
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
    });

  const [first, second, third, fourth] = path;
  if (path.length === 0) {
    MORPH_ROOT_FIELDS.forEach(addField);
  } else if (first === "timing" && path.length === 1) {
    MORPH_TIMING_FIELDS.forEach(addField);
  } else if (first === "layers" && path.length === 1) {
    for (const label of labels) addLabel(label, ":", "layer label");
  } else if (first === "layers" && path.length === 2) {
    MORPH_POLICY_FIELDS.forEach(addField);
  } else if (first === "keyframes" && path.length === 1 && !dashed) {
    for (const position of KEYFRAME_POSITIONS) {
      add({
        label: position,
        kind: CompletionItemKind.Keyword,
        detail: "keyframe position",
        textEdit: { range: replaceRange(typed.length), newText: `${position}:` },
      });
    }
  } else if (
    first === "keyframes" &&
    ((path.length === 1 && dashed) || path.length === 2)
  ) {
    if (second === "-" || dashed) addField("offset");
    const groups = new Set(
      (candidates.length > 0 ? candidates : images).flatMap((image) =>
        Object.keys(image.vocabulary.groups),
      ),
    );
    for (const group of groups) addLabel(group, ":", "attribute group");
    for (const label of labels) addLabel(label, ":", "layer label");
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
