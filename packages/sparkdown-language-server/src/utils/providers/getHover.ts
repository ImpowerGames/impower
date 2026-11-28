import { readSourceDirective } from "@impower/sparkdown/src/compiler/utils/readDirective";
import { directiveOwnLookPick } from "@impower/sparkdown/src/compiler/utils/directiveOwnLook";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/compiler/utils/getExpectedSelectorTypes";
import {
  getImagePreviewMarkupComposited,
  type ImageCompositeOptions,
} from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { resolveSelector } from "@impower/sparkdown/src/compiler/utils/resolveSelector";
import { resolveImageRoot } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { getTypedImageEntry } from "@impower/sparkdown/src/compiler/utils/resolveImageReference";
import { imageThingsOf } from "@impower/sparkdown/src/attributes/imageFileName";
import { rasterLayerOfPath } from "@impower/sparkdown/src/attributes/rasterSource";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { MORPH_CLAUSE_DOC, MORPH_FIELD_DOCS } from "@impower/sparkdown/src/compiler/morph/morphSchema";
import { braceBlockPathAt } from "@impower/sparkdown/src/compiler/utils/braceBlocks";
import { own } from "@impower/sparkdown/src/morph/own";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { isLayoutVerb } from "@impower/sparkdown/language/sparkdown.layout-verbs";
import { LAYOUT_CONTROL_DESCRIPTIONS } from "./layoutControlDescriptions";
import { getStyleValueDescription } from "./styleValueDescriptions";
import {
  getStreamBlockHover,
  getStreamEntryStateHover,
  getTemplatedElementHover,
} from "./streamElementHelp";
import { getAlternatorKeywordHover } from "./alternatorKeywordHelp";
import { getClearPropHover } from "./clearPropHelp";
import { getKindLayoutHover } from "./kindLayoutHelp";
import { getPresenceBlockHover } from "./presenceBlockHelp";
import { getSelectorAttributeHover } from "./selectorAttributeHelp";
import { getVariantPropHover } from "./variantPropHelp";
import {
  MarkupKind,
  type Hover,
  type Position,
  type Range,
} from "vscode-languageserver";

const JOINING_LINES_GUIDE =
  "https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/JoiningLines.md";

const GLUE_HOVER = {
  lineEnd:
    "A `..` at the end of a line joins the next line shown onto this one, in the same text box, when that line begins with `..`. The spaces before the mark are kept.",
  beforeBreak:
    "A `..` before a `>` break keeps the box open after the click: the part after the break carries on in this box when it begins with `..`.",
  beforeCarry:
    "A `..` before a `>>` keeps the box open with no click: the next line shown carries on in this box when it begins with `..`.",
  lineStart:
    "A `..` at the start of a line joins this line onto the line shown before it, when that line ends with `..`. Otherwise this line shows on its own, and the game warns that it joins nothing.",
  afterBreak:
    "A `..` after a `>` break carries on in the same box after the click, when the part before the break ends with `..`.",
};

const CARRY_HOVER =
  "A `>>` at the end of a line carries on without a click once the line has finished showing. In a stream that advances by itself it also skips the stream's `pause`: write a `<wait=N>` before it for a beat before the next line.";

const getCarryHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const mark = stack.find((node) => node.name === "Carry");
  if (!mark) {
    return null;
  }
  const from = mark.from + document.read(mark.from, mark.to).indexOf(">>");
  if (offset < from || offset > from + 2) {
    return null;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `${CARRY_HOVER}\n\n[Joining lines](${JOINING_LINES_GUIDE}#133-carrying-on-without-a-click)`,
    },
    range: document.range(from, from + 2),
  };
};

const getLayoutControlHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const control = stack.find((node) => node.name === "AssetCommandControl");
  if (!control || !stack.some((node) => node.name === "ImageCommand")) {
    return null;
  }
  const verb = document.getText(document.range(control.from, control.to)).trim();
  if (!isLayoutVerb(verb)) {
    return null;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: LAYOUT_CONTROL_DESCRIPTIONS[verb],
    },
    range: document.range(control.from, control.to),
  };
};

const SHOWING_HOVER =
  "`@showing(name)` applies while a layout or an element named `name` is on screen: a layout while it is open, an element while it or an element inside it has content. It holds across the whole game, so any element's style can use it.";

const getShowingHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const state = stack.find((node) => node.name === "SelectorStateName");
  if (!state || document.read(state.from, state.to) !== "showing") {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: SHOWING_HOVER },
    range: document.range(state.from - 1, state.to),
  };
};

const LINE_HOVERS: ReadonlyMap<string, string> = new Map([
  [
    "variant",
    "`@variant(name)` applies while the newest line showing is labelled `name` in its cue's brackets, as `BUNNY [shout]:` is labelled `shout`. It holds across the whole game, so any element's style can use it. `[<]` is `left` and `[>]` is `right`.",
  ],
  [
    "speaker",
    "`@speaker(name)` applies while the newest line showing is spoken by the character defined as `name`. It holds across the whole game, so any element's style can use it.",
  ],
]);

const VARIANT_HOVER =
  "A variant labels the line: a layout's `#variant=name` element takes only lines with that label, a style's `@variant(name)` applies while such a line is the newest, and a typewriter named after the variant types it. `[<]` is short for `[left]` and `[>]` for `[right]`. A variant uses letters, digits and `_`.";

const getLineHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const state = stack.find((node) => node.name === "SelectorStateName");
  const hover = state ? LINE_HOVERS.get(document.read(state.from, state.to)) : undefined;
  if (state && hover) {
    return {
      contents: { kind: MarkupKind.Markdown, value: hover },
      range: document.range(state.from - 1, state.to),
    };
  }
  const variant = stack.find((node) => node.name === "DialogueCharacterPositionContent");
  if (variant) {
    return {
      contents: { kind: MarkupKind.Markdown, value: VARIANT_HOVER },
      range: document.range(variant.from, variant.to),
    };
  }
  return null;
};

export const SCREEN_KEYWORD_DESCRIPTION = [
  "`screen` groups layouts that take turns: `layout settings in menu { … }` puts a layout in the `menu` screen, and `[[navigate menu to settings]]` shows it in place of the screen's other layouts.",
  "",
  "Elements written in the screen's body stay on screen while any of its layouts is open. They appear when the first one opens, stay the same elements while `navigate` swaps one layout for another, and leave when none is open.",
  "",
  "The open layout is placed where the body writes `slot`, so a shared frame can wrap it. With no `slot`, the layout is placed after the screen's own elements.",
  "",
  "```sparkdown",
  "screen menu {",
  "  panel {",
  '    header { text "My Game" }',
  "    slot",
  "  }",
  "}",
  "```",
].join("\n");

const getScreenKeywordHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const keyword = stack.find((node) => node.name === "LuauScreenKeyword");
  if (!keyword) {
    return null;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: SCREEN_KEYWORD_DESCRIPTION,
    },
    range: document.range(keyword.from, keyword.to),
  };
};

const getStyleValueHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const line = document.getLineText(position.line);
  const isWordChar = (ch: string | undefined) => !!ch && /[\w-]/.test(ch);
  let start = position.character;
  let end = position.character;
  while (isWordChar(line[start - 1])) start -= 1;
  while (isWordChar(line[end])) end += 1;
  const word = line.slice(start, end);
  if (!word) {
    return null;
  }
  const stack = getStack<SparkdownNodeName>(tree, document.offsetAt(position), 1);
  const value = stack.find((node) => node.name === "StylingValue");
  const property = stack.find((node) => node.name === "LuauStructBlockProperty");
  if (!value || !property) {
    return null;
  }
  const key = /^\s*([\w-]+)\s*=\s*$/.exec(document.read(property.from, value.from))?.[1];
  const description = key ? getStyleValueDescription(key, word) : undefined;
  if (!description) {
    return null;
  }
  return {
    contents: description,
    range: {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end },
    },
  };
};

const getGlueHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const mark = stack.find(
    (node) => node.name === "Glue" || node.name === "LeadingGlue",
  );
  if (!mark) {
    return null;
  }
  const from = mark.name === "Glue" ? mark.to - 2 : mark.from;
  if (offset < from || offset >= mark.to) {
    return null;
  }
  let text: string;
  if (mark.name === "Glue") {
    if (mark.prevSibling?.name === "Break") {
      return null;
    }
    const after = document.getText({
      start: document.positionAt(mark.to),
      end: { line: document.positionAt(mark.to).line + 1, character: 0 },
    });
    const onLine = after.split(/\r?\n/)[0]!;
    const markAfter = mark.to + onLine.length - onLine.trimStart().length;
    const carries = getStack<SparkdownNodeName>(tree, markAfter + 1, 1).some(
      (node) => node.name === "Carry",
    );
    text = carries
      ? GLUE_HOVER.beforeCarry
      : after.trimStart().startsWith(">")
        ? GLUE_HOVER.beforeBreak
        : GLUE_HOVER.lineEnd;
  } else {
    text = stack.some((node) => node.name === "BreakLeadingGlue")
      ? GLUE_HOVER.afterBreak
      : GLUE_HOVER.lineStart;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `${text}\n\n[Joining lines](${JOINING_LINES_GUIDE})`,
    },
    range: document.range(from, mark.to),
  };
};

const getMorphFieldHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  let inMorph = false;
  for (let node: SyntaxNode | null = tree.resolveInner(offset, -1); node; node = node.parent) {
    if (node.name === "LuauMorph") {
      inMorph = true;
      break;
    }
  }
  if (!inMorph) {
    return null;
  }
  const line = document.getLineText(position.line);
  const isNameChar = (ch: string | undefined) => !!ch && /[\w]/.test(ch);
  let start = position.character;
  let end = position.character;
  while (isNameChar(line[start - 1])) start -= 1;
  while (isNameChar(line[end])) end += 1;
  const name = line.slice(start, end);
  if (!name || !/^[ \t]*(=|\{)/.test(line.slice(end))) {
    return null;
  }
  const read = (from: number, to: number) => document.read(from, to);
  const path = braceBlockPathAt(tree, offset, read)?.path ?? [];
  if (path[0] === "layers" && path.length === 1) {
    return null;
  }
  const doc =
    (path[0] === "paints" || path[0] === "clips" || path[0] === "replay" ? own(MORPH_FIELD_DOCS, `${path[0]}.${name}`) : undefined) ??
    own(MORPH_FIELD_DOCS, name);
  if (!doc) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: doc },
    range: {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end },
    },
  };
};

const getMorphClauseHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  for (const side of [1, -1] as const) {
    const node = tree.resolveInner(offset, side);
    if (node.name !== "AssetCommandClauseKeyword" || document.read(node.from, node.to) !== "morph") continue;
    let command = node.parent;
    while (command && command.name !== "ImageCommand") command = command.parent;
    const directive = command ? readSourceDirective(command, (from, to) => document.read(from, to)) : undefined;
    const read = directive?.kind === "image" && directive.clauses.some(
      (clause) => clause.word.text === "morph" && clause.word.from === node.from && clause.word.to === node.to,
    );
    if (!read) continue;
    return {
      contents: { kind: MarkupKind.Markdown, value: MORPH_CLAUSE_DOC },
      range: document.range(node.from, node.to),
    };
  }
  return null;
};

const leafOf = (uri: string) => {
  const leaf = uri.slice(uri.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
};

const getPortraitFolderFiles = (
  context: SparkProgram["context"],
  root: { uri: string; assets?: unknown },
): string[] => {
  const files: string[] = [];
  for (const asset of Object.values<any>(root.assets ?? {})) {
    const uri = context?.["image"]?.[asset?.$name]?.uri;
    if (typeof uri !== "string") return [];
    let path: string;
    try {
      path = decodeURIComponent(new URL(uri).pathname);
    } catch {
      return [];
    }
    if (rasterLayerOfPath(path)?.directory !== root.uri) return [];
    files.push(path.slice(root.uri.length + 1));
  }
  return files;
};

const getPictureFiles = (
  context: SparkProgram["context"],
  struct: any,
): string[] => {
  const root = resolveImageRoot(context, struct);
  if (root?.$type !== "layered_image" || typeof root.uri !== "string") {
    return [];
  }
  const portraitFiles = getPortraitFolderFiles(context, root);
  if (portraitFiles.length) {
    return portraitFiles;
  }
  const uris = new Set<string>();
  for (const image of Object.values<any>(context?.["image"] ?? {})) {
    if (typeof image?.uri === "string") uris.add(image.uri);
  }
  const picture = imageThingsOf(uris)
    .flatMap((thing) => thing.pictures)
    .find((candidate) => candidate.name === root.$name);
  if (!picture?.layers.length) {
    return [];
  }
  const paths = [
    ...(picture.path === undefined ? [] : [picture.path]),
    ...picture.layers.map((layer) => layer.path),
  ];
  return paths[0] === root.uri ? paths.map(leafOf) : [];
};

const framingHover = (framing: Record<string, unknown>): string =>
  [
    `**framing** \`${String(framing["$name"] ?? "")}\``,
    `\`x = ${String(framing["x"])}\` · \`y = ${String(framing["y"])}\` · \`zoom = ${String(framing["zoom"])}\``,
    "`x` and `y` put that point across and down the picture on the same point of its layer: `0%` sets the left or top edges flush, `100%` the right or bottom edges. `zoom` is how close the view is, where `1` is the picture's size on its layer.",
  ].join("\n\n");

const transitionHover = (transition: Record<string, unknown>, context: SparkProgram["context"]): string => {
  const animationName = (value: unknown): string | undefined =>
    typeof value === "string" ? value : typeof (value as { $name?: unknown })?.$name === "string" ? (value as { $name: string }).$name : undefined;
  const played = (name: string) => {
    const duration = (context?.["animation"]?.[name] as { timing?: { duration?: unknown } } | undefined)?.timing?.duration;
    return duration === undefined ? `\`${name}\`` : `\`${name}\` (${String(duration)})`;
  };
  const arms = Object.entries(transition).flatMap(([arm, value]) => {
    const name = arm.startsWith("$") ? undefined : animationName(value);
    return name ? [[arm, name] as const] : [];
  });
  const lines = [
    ...arms.filter(([arm]) => arm === "on_show").map(([, name]) => `- arrives by ${played(name)}`),
    ...arms.filter(([arm]) => arm === "on_hide").map(([, name]) => `- leaves by ${played(name)}`),
    ...arms.filter(([arm]) => !arm.startsWith("on_")).map(([arm, name]) => `- plays ${played(name)} on \`${arm}\``),
  ];
  return [
    `**transition** \`${String(transition["$name"] ?? "")}\``,
    ...(lines.length ? [lines.join("\n")] : []),
    "Write it after `using` on a picture line: the line's `over` stretches the whole transition to that length, `after` delays it and `ease` eases it.",
  ].join("\n\n");
};

export const getHover = async (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations | undefined,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
  position: Position,
  options?: ImageCompositeOptions,
): Promise<Hover | null> => {
  if (document && tree) {
    const glueHover = getGlueHover(document, tree, position);
    if (glueHover) {
      return glueHover;
    }
    const carryHover = getCarryHover(document, tree, position);
    if (carryHover) {
      return carryHover;
    }
    const showingHover = getShowingHover(document, tree, position);
    if (showingHover) {
      return showingHover;
    }
    const lineHover = getLineHover(document, tree, position);
    if (lineHover) {
      return lineHover;
    }
    const alternatorHover = getAlternatorKeywordHover(document, tree, position);
    if (alternatorHover) {
      return alternatorHover;
    }
    const layoutControlHover = getLayoutControlHover(document, tree, position);
    if (layoutControlHover) {
      return layoutControlHover;
    }
    const clearPropHover = getClearPropHover(document, tree, position);
    if (clearPropHover) {
      return clearPropHover;
    }
    const variantPropHover = getVariantPropHover(document, tree, position, program);
    if (variantPropHover) {
      return variantPropHover;
    }
    const streamHover = getTemplatedElementHover(document, tree, position);
    if (streamHover) {
      return streamHover;
    }
    const streamBlockHover = getStreamBlockHover(document, tree, position);
    if (streamBlockHover) {
      return streamBlockHover;
    }
    const screenKeywordHover = getScreenKeywordHover(document, tree, position);
    if (screenKeywordHover) {
      return screenKeywordHover;
    }
    const kindLayoutHover = getKindLayoutHover(document, tree, position, program);
    if (kindLayoutHover) {
      return kindLayoutHover;
    }
    const styleValueHover = getStyleValueHover(document, tree, position);
    if (styleValueHover) {
      return styleValueHover;
    }
    const morphFieldHover = getMorphFieldHover(document, tree, position);
    if (morphFieldHover) {
      return morphFieldHover;
    }
    const morphClauseHover = getMorphClauseHover(document, tree, position);
    if (morphClauseHover) {
      return morphClauseHover;
    }
    const presenceHover = getPresenceBlockHover(document, tree, position);
    if (presenceHover) {
      return presenceHover;
    }
    const entryStateHover = getStreamEntryStateHover(document, tree, position);
    if (entryStateHover) {
      return entryStateHover;
    }
    const selectorAttributeHover = getSelectorAttributeHover(document, tree, position);
    if (selectorAttributeHover) {
      return selectorAttributeHover;
    }
  }
  if (!document || !annotations || !program) {
    return null;
  }
  let match: { struct: any; range: Range } | null = null;
  const searchFrom = document.offsetAt(position);
  const searchTo = document.offsetAt({ line: position.line + 1, character: 0 });
  annotations.references.between(searchFrom, searchTo, (from, to, value) => {
    if (match != null) {
      return false;
    }
    const range = document.range(from, to);
    const hoveredOffset = document.offsetAt(position);
    if (
      hoveredOffset >= document.offsetAt(range.start) &&
      hoveredOffset <= document.offsetAt(range.end)
    ) {
      const reference = value.type;
      if (reference.selectors) {
        let resolvedValue: any = undefined;
        for (const selector of reference.selectors) {
          const [resolved] = resolveSelector<any>(
            program,
            selector,
            getExpectedSelectorTypes(program, reference.assigned, config),
          );
          if (resolved) {
            resolvedValue = resolved;
          }
        }
        if (resolvedValue !== undefined) {
          if (
            typeof resolvedValue === "object" &&
            "$type" in resolvedValue &&
            typeof resolvedValue.$type === "string"
          ) {
            match = { struct: resolvedValue, range };
            return false;
          }
        }
      }
      if (reference.asset) {
        const { types, name } = reference.asset;
        for (const type of types) {
          const entry = getTypedImageEntry(program.context, type, name);
          if (entry && typeof entry === "object" && typeof entry.$type === "string") {
            match = { struct: entry, range };
            return false;
          }
        }
      }
    }
    return undefined;
  });
  if (!match) {
    return null;
  }
  const { struct, range } = match as { struct: any; range: Range };
  if (struct.$type === "framing") {
    return {
      contents: { kind: MarkupKind.Markdown, value: framingHover(struct) },
      range,
    };
  }
  if (struct.$type === "transition") {
    return {
      contents: { kind: MarkupKind.Markdown, value: transitionHover(struct, program.context) },
      range,
    };
  }
  const pick = tree
    ? directiveOwnLookPick(tree, (from, to) => document.read(from, to), document.offsetAt(range.start))
    : undefined;
  const preview = await getImagePreviewMarkupComposited(
    program.context,
    struct,
    pick === undefined ? options : { ...options, pick },
  );
  const files = getPictureFiles(program.context, struct);
  const sections = [
    ...(preview ? [preview] : []),
    ...(files.length ? [`Made from, bottom to top:\n\n${files.map((file) => `- \`${file}\``).join("\n")}`] : []),
  ];
  if (!sections.length) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: sections.join("\n\n") },
    range,
  };
};
