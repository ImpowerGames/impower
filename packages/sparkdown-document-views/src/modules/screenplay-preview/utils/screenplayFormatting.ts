import { HighlightStyle, syntaxTree } from "@codemirror/language";
import type { EditorState, Line, Text } from "@codemirror/state";
import { Extension, Range, RangeSet, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { VSCodeLanguageSupport } from "@impower/codemirror-vscode-language/src";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import type { ScreenplayConfig } from "../../../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import { getStyleTags, highlightTree, tags } from "@lezer/highlight";
import { PAGE_POSITIONS } from "../../../../../sparkdown-screenplay/src/constants/PAGE_POSITIONS";
import { printsAsBlankLine } from "../../../../../sparkdown-screenplay/src/utils/printsAsBlankLine";
import { rootFunctionName } from "../../../../../sparkdown-screenplay/src/utils/rootFunctionName";
import { screenplayPageLayout } from "../../../../../sparkdown-screenplay/src/utils/screenplayPageLayout";
import GRAMMAR from "../../../../../sparkdown/language/sparkdown.language-grammar.json";
import CollapseWidget from "../classes/widgets/CollapseWidget";
import DialogueWidget, {
  DialogueSpec,
} from "../classes/widgets/DialogueWidget";
import LineBreakWidget from "../classes/widgets/LineBreakWidget";
import NameWidget from "../classes/widgets/NameWidget";
import PageBreakWidget from "../classes/widgets/PageBreakWidget";
import TitlePageWidget, {
  TitlePageSpec,
} from "../classes/widgets/TitlePageWidget";
import { CollapseSpec } from "../types/CollapseSpec";
import { MarkSpec } from "../types/MarkSpec";
import { MarkupContent } from "../types/MarkupContent";
import { NameSpec } from "../types/NameSpec";
import { PageBreakSpec } from "../types/PageBreakSpec";
import { ReplaceSpec } from "../types/ReplaceSpec";
import { RevealSpec } from "../types/RevealSpec";
import {
  screenplayConfigField,
  screenplayPicksField,
} from "./screenplaySettings";

const DIALOGUE_WIDTH = "60%";
const CHARACTER_PADDING = "16%";
const PARENTHETICAL_PADDING = "8%";

const DUAL_DIALOGUE_WIDTH = "90%";
const DUAL_CHARACTER_PADDING = "16%";
const DUAL_PARENTHETICAL_PADDING = "8%";

type DecorationSpec =
  | ReplaceSpec
  | RevealSpec
  | CollapseSpec
  | DialogueSpec
  | TitlePageSpec
  | MarkSpec
  | PageBreakSpec
  | NameSpec;

const getDialogueLineStyle = (type: string) => {
  const dialogueWidth = DIALOGUE_WIDTH;
  let paddingLeft = "0";
  let paddingRight = "0";
  if (type === "character") {
    paddingLeft = CHARACTER_PADDING;
  }
  if (type === "parenthetical") {
    paddingLeft = PARENTHETICAL_PADDING;
    paddingRight = PARENTHETICAL_PADDING;
  }
  return `display: block; opacity: 1; margin: 0 auto; width: ${dialogueWidth}; padding: 0 ${paddingRight} 0 ${paddingLeft};`;
};

const getDualDialogueLineStyle = (type: string) => {
  const dialogueWidth = DUAL_DIALOGUE_WIDTH;
  let paddingLeft = "0";
  let paddingRight = "0";
  if (type === "character") {
    paddingLeft = DUAL_CHARACTER_PADDING;
  }
  if (type === "parenthetical") {
    paddingLeft = DUAL_PARENTHETICAL_PADDING;
    paddingRight = DUAL_PARENTHETICAL_PADDING;
  }
  return `opacity: 1; margin: 0 auto; width: ${dialogueWidth}; padding: 0 ${paddingRight} 0 ${paddingLeft};`;
};

const LANGUAGE_NAME = "sparkdown";

const LANGUAGE_SUPPORT = new VSCodeLanguageSupport(LANGUAGE_NAME, GRAMMAR);

const INLINE_HIDDEN_TAGS = [
  tags.definition(tags.escape),
  tags.definition(tags.keyword),
  tags.definition(tags.controlKeyword),
  tags.definition(tags.typeName),
  tags.definition(tags.variableName),
  tags.definition(tags.propertyName),
  tags.definition(tags.punctuation),
  tags.definition(tags.content),
  tags.definition(tags.separator),
  tags.definition(tags.logicOperator),
  tags.local(tags.content),
  tags.comment,
  tags.blockComment,
  tags.docComment,
  tags.macroName,
  tags.meta,
  tags.logicOperator,
  tags.controlKeyword,
];

const createHighlightStyle = (inlineHiddenStyle: Record<string, string>) =>
  HighlightStyle.define([
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.link, textDecoration: "underline", textUnderlineOffset: "5px" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.labelName, display: "block", textAlign: "right" },

    {
      tag: tags.special(tags.meta),
      display: "block",
      visibility: "hidden",
      height: "0",
    },

    ...INLINE_HIDDEN_TAGS.map((tag) => ({ tag, ...inlineHiddenStyle })),

    {
      tag: tags.contentSeparator,
      display: "block",
      color: "transparent",
      borderBottom: "1px solid #00000033",
    },
  ]);

const LANGUAGE_HIGHLIGHTS = createHighlightStyle({
  display: "none",
});

const DUAL_LANGUAGE_HIGHLIGHTS = createHighlightStyle({
  display: "none",
});

export const debugDecorations = (
  decorations: RangeSet<Decoration>,
  state: EditorState,
) => {
  const iter = decorations.iter(0);
  while (iter.value) {
    console.log(
      iter.from,
      iter.to,
      JSON.stringify(state.sliceDoc(iter.from, iter.to)),
      iter.value,
    );
    iter.next();
  }
};

const createRevealDecorations = (doc: Text, from: number, to?: number) => {
  const lineDecorations: Range<Decoration>[] = [];
  const startLineNumber = doc.lineAt(from).number;
  const endLineNumber = doc.lineAt(to ?? from).number;
  for (let i = startLineNumber; i <= endLineNumber; i++) {
    lineDecorations.push(
      Decoration.line({
        attributes: { style: "opacity: 1" },
      }).range(doc.line(i).from),
    );
  }
  return lineDecorations;
};

const createDecorations = (
  doc: Text,
  spec: DecorationSpec,
): Range<Decoration>[] => {
  if (spec.type === "mark") {
    return [
      Decoration.mark({
        attributes: spec.attributes,
      }).range(spec.from, spec.to),
    ];
  }
  if (spec.type === "reveal") {
    return createRevealDecorations(doc, spec.from, spec.to);
  }
  if (spec.type === "collapse") {
    if (spec.separator) {
      return [
        Decoration.line({
          class: "collapse",
        }).range(doc.lineAt(spec.from).from),
      ];
    }
    return [
      Decoration.replace({
        widget: new CollapseWidget(spec),
        block: true,
      }).range(spec.from, spec.to),
    ];
  }
  if (spec.type === "page_break") {
    return [
      Decoration.replace({
        widget: new PageBreakWidget(spec),
        block: true,
      }).range(spec.from, spec.to),
    ];
  }
  if (spec.type === "name") {
    return [
      Decoration.replace({
        widget: new NameWidget(spec),
        block: true,
      }).range(spec.from, spec.to),
    ];
  }
  if (spec.type === "title_page") {
    return [
      Decoration.replace({
        widget: new TitlePageWidget(spec),
      }).range(spec.from, spec.to),
    ];
  }
  if (spec.type === "dialogue") {
    if (spec.grid) {
      return [
        ...createRevealDecorations(doc, spec.from, spec.to),
        Decoration.replace({
          widget: new DialogueWidget(spec),
          block: true,
        }).range(spec.from, spec.to),
      ];
    } else {
      const blocks = spec.blocks[0];
      if (blocks) {
        return blocks.map((b) =>
          Decoration.line({
            attributes: b.attributes,
          }).range(doc.lineAt(b.from).from),
        );
      }
    }
  }
  if (spec.type === "replace") {
    return [Decoration.replace({}).range(spec.from, spec.to)];
  }
  return [];
};

export const SCREENPLAY_LANGUAGE_SUPPORT = LANGUAGE_SUPPORT;

const PRINTED_NAME_SETTINGS = [
  "screenplay_print_scene_identifiers",
  "screenplay_print_branch_identifiers",
  "screenplay_print_function_identifiers",
  "screenplay_print_knot_identifiers",
  "screenplay_print_stitch_identifiers",
] as const;

interface CachedPageLayout {
  settings: string;
  blankPositions: Set<number>;
  printed: number[];
  actionStarts: number[];
}

const pageLayoutCache = new WeakMap<Tree, CachedPageLayout>();

const cachedPageLayout = (tree: Tree, doc: Text, config?: ScreenplayConfig) => {
  const settings = PRINTED_NAME_SETTINGS.map((key) => (config?.[key] ? "1" : "0")).join("");
  const cached = pageLayoutCache.get(tree);
  if (cached && cached.settings === settings) {
    return cached;
  }
  const layout = screenplayPageLayout(tree, doc.toString(), config);
  const result = {
    settings,
    blankPositions: new Set(layout.blankLines),
    printed: layout.printed,
    actionStarts: layout.actionStarts,
  };
  pageLayoutCache.set(tree, result);
  return result;
};

export const decorate = (
  state: EditorState,
  from: number = 0,
  to?: number,
  treeOverride?: import("@lezer/common").Tree,
) => {
  let prevDialogueSpec: DialogueSpec | undefined = undefined;
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;
  const config = state.field(screenplayConfigField, false);
  const picks = state.field(screenplayPicksField, false);
  let sceneNumber = 0;

  const declarationName = (nodeRef: SyntaxNodeRef, child: SparkdownNodeName) => {
    const cursor = nodeRef.node.cursor();
    while (cursor.next() && cursor.from < nodeRef.to) {
      if (cursor.name === child) {
        return doc.sliceString(cursor.from, cursor.to).trim();
      }
    }
    return "";
  };

  const blockEnd = (nodeRef: SyntaxNodeRef) =>
    doc.sliceString(nodeRef.from, nodeRef.to).endsWith("\n")
      ? nodeRef.to - 1
      : nodeRef.to;

  const isOnlyHiddenDirectives = (text: string): boolean => {
    const stripped = text
      .replace(/\[\[[^\]]*\]\]/g, "")
      .replace(/\(\([^)]*\)\)/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    return stripped.length === 0 && text.trim().length > 0;
  };

  const findBlockContentEnd = (from: number, to: number): number => {
    let lastContentChar = -1;
    for (let i = to - 1; i >= from; i--) {
      const c = doc.sliceString(i, i + 1);
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
        lastContentChar = i;
        break;
      }
    }
    if (lastContentChar < 0) return from;
    for (let i = lastContentChar + 1; i < to; i++) {
      if (doc.sliceString(i, i + 1) === "\n") {
        return i + 1;
      }
    }
    return to;
  };

  const isCentered = (nodeRef: SyntaxNodeRef) => {
    const name = nodeRef.name as SparkdownNodeName;
    if (
      name === "Centered" ||
      name === "ChoiceStartCentered" ||
      name === "ChoiceOnlyCentered" ||
      name === "ChoiceInnerCentered" ||
      name === "BlockTitle" ||
      name === "InlineTitle"
    ) {
      return true;
    }
    return false;
  };

  const centerRange = (nodeRef: SyntaxNodeRef) => {
    const from = nodeRef.from;
    const to = nodeRef.to;
    decorations.push(
      ...createDecorations(doc, {
        type: "mark",
        from,
        to,
        attributes: {
          style: "display: block; opacity: 1; text-align: center;",
        },
      }),
    );
  };

  const isLuauFlowBlockContainer = (name: string) =>
    /^LuauSparkdown[A-Za-z]*(Block|Clause|Loop)$/.test(name);

  const isBlankLine = (nodeRef: SyntaxNodeRef) =>
    printsAsBlankLine(nodeRef.name, nodeRef.node.parent?.name);

  const opensOwnLine = (nodeRef: SyntaxNodeRef) =>
    doc.lineAt(nodeRef.from).to < blockEnd(nodeRef);

  const isInlineHidden = (nodeRef: SyntaxNodeRef) => {
    const result = getStyleTags(nodeRef);
    return result?.tags.some((t) => INLINE_HIDDEN_TAGS.includes(t));
  };

  const tree = treeOverride ?? syntaxTree(state);

  const { blankPositions, printed, actionStarts } = cachedPageLayout(tree, doc, config);

  const printedBefore = (from: number, to: number) => {
    let low = 0;
    let high = printed.length / 2;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (printed[middle * 2 + 1]! <= from) low = middle + 1;
      else high = middle;
    }
    return low * 2 < printed.length && printed[low * 2]! < to;
  };

  for (const start of actionStarts) {
    if (start >= from && (to === undefined || start <= to) && printedBefore(doc.lineAt(start).from, start)) {
      decorations.push(Decoration.widget({ widget: new LineBreakWidget(), side: 1 }).range(start));
    }
  }

  let printedIndex = 0;
  const holdsPrintedText = (from: number, to: number) => {
    while (printedIndex < printed.length && printed[printedIndex + 1]! <= from) {
      printedIndex += 2;
    }
    return printedIndex < printed.length && printed[printedIndex]! < to;
  };

  const isUnprinted = (nodeRef: SyntaxNodeRef) => {
    const { from, to } = nodeRef;
    if (inFrontMatter || to <= from || nodeRef.name === "Newline" || holdsPrintedText(from, to)) {
      return false;
    }
    if (doc.lineAt(from).to < to - 1 && nodeRef.node.firstChild) {
      return false;
    }
    return /\S/.test(doc.sliceString(from, to));
  };

  const printedSlice = (from: number, to: number) => {
    holdsPrintedText(from, to);
    let text = "";
    for (let index = printedIndex; index < printed.length && printed[index]! < to; index += 2) {
      text += doc.sliceString(Math.max(from, printed[index]!), Math.min(to, printed[index + 1]!));
    }
    return text;
  };

  const blankLines = new Set(
    [...blankPositions].map((position) => doc.lineAt(Math.min(position, doc.length)).number),
  );

  const handledLines = new Set<number>();

  const blankRow = (line: Line) =>
    line.text.trim()
      ? createDecorations(doc, { type: "collapse", from: line.from, to: line.to })
      : createDecorations(doc, {
          type: "collapse",
          from: line.from,
          to: line.to,
          separator: true,
        });

  const printsText = (node: SyntaxNode) =>
    node.name !== "Newline" &&
    node.name !== "Whitespace" &&
    !printsAsBlankLine(node.name, node.parent?.name);

  const functionNameOf = (node: SyntaxNode) =>
    config?.screenplay_print_function_identifiers
      ? rootFunctionName(node, (from, to) => doc.sliceString(from, to))
      : "";

  const lineParts = (line: Line, node: SyntaxNode) => {
    let first = node;
    while (first.prevSibling && first.prevSibling.to > line.from) {
      first = first.prevSibling;
    }
    const parts: SyntaxNode[] = [];
    for (let part: SyntaxNode | null = first; part && part.from < line.to; part = part.nextSibling) {
      parts.push(part);
    }
    return parts;
  };

  const splitSharedLine = (line: Line, node: SyntaxNode) => {
    const parts = lineParts(line, node);
    const firstText = parts.findIndex(printsText);
    const hiddenParts = parts.filter((part) => printsAsBlankLine(part.name, part.parent?.name));
    if (firstText < 0 && hiddenParts.length < 2) return false;
    handledLines.add(line.number);
    if (firstText < 0) {
      decorations.push(Decoration.line({ class: "sp-gone" }).range(line.from));
      if (line.length > 0) {
        decorations.push(Decoration.replace({}).range(line.from, line.to));
      }
    }
    const textIndex = firstText < 0 ? parts.length : firstText;
    const above: (CollapseWidget | NameWidget)[] = [];
    const below: (CollapseWidget | NameWidget)[] = [];
    parts.forEach((part, index) => {
      if (!printsAsBlankLine(part.name, part.parent?.name)) return;
      const from = Math.max(part.from, line.from);
      const to = Math.min(blockEnd(part), line.to);
      if (firstText >= 0 && to > from) {
        decorations.push(Decoration.replace({}).range(from, to));
      }
      if (part.from < line.from) return;
      const rows = index < textIndex ? above : below;
      if (blankPositions.has(part.from)) {
        rows.push(new CollapseWidget({ type: "collapse", from: part.from, to: part.from }));
      }
      const name = functionNameOf(part);
      if (name) {
        rows.push(new NameWidget({ type: "name", from: part.from, to: part.from, name, pageBreak: false }));
      }
    });
    above.forEach((widget, index) => {
      decorations.push(
        Decoration.widget({ widget, block: true, side: index - above.length }).range(line.from),
      );
    });
    below.forEach((widget, index) => {
      decorations.push(Decoration.widget({ widget, block: true, side: index + 1 }).range(line.to));
    });
    return true;
  };

  const hideLines = (
    fromPosition: number,
    toPosition: number,
    name = "",
    node?: SyntaxNode,
  ) => {
    const first = doc.lineAt(fromPosition).number;
    const last = doc.lineAt(toPosition).number;
    for (let number = first; number <= last; number++) {
      if (handledLines.has(number)) continue;
      const line = doc.line(number);
      if (node && (number === first || number === last) && splitSharedLine(line, node)) {
        continue;
      }
      handledLines.add(number);
      if (number === first && name) {
        if (blankLines.has(number)) {
          decorations.push(
            Decoration.widget({
              widget: new CollapseWidget({ type: "collapse", from: line.from, to: line.from }),
              block: true,
              side: -1,
            }).range(line.from),
          );
        }
        decorations.push(
          ...createDecorations(doc, {
            type: "name",
            from: line.from,
            to: line.to,
            name,
            pageBreak: false,
          }),
        );
      } else if (blankLines.has(number)) {
        decorations.push(...blankRow(line));
      } else {
        decorations.push(Decoration.line({ class: "sp-gone" }).range(line.from));
        if (line.length > 0) {
          decorations.push(Decoration.replace({}).range(line.from, line.to));
        }
      }
    }
  };

  const hideInlineRange = (nodeRef: SyntaxNodeRef) => {
    const from = nodeRef.from;
    const to = nodeRef.to;
    if (nodeRef.to > nodeRef.from) {
      decorations.push(
        ...createDecorations(doc, {
          type: "replace",
          from,
          to,
        }),
      );
    }
  };

  const isWhitespaceOnly = (start: number, end: number): boolean => {
    if (end <= start) return true;
    const slice = doc.sliceString(start, end);
    for (let i = 0; i < slice.length; i++) {
      const c = slice.charCodeAt(i);
      if (c !== 0x20 && c !== 0x09) return false;
    }
    return true;
  };

  const isLeadingIndent = (
    nodeName: SparkdownNodeName,
    nodeFrom: number,
    nodeTo: number,
  ): boolean => {
    if (nodeName !== "OptionalWhitespace") return false;
    if (nodeTo <= nodeFrom) return false;
    return doc.lineAt(nodeFrom).from === nodeFrom;
  };

  let lineStart = from;
  const processNewline = (newlineFrom: number, newlineTo: number) => {
    if (isWhitespaceOnly(lineStart, newlineFrom)) {
      hideLines(lineStart, lineStart);
    }
    lineStart = newlineTo;
  };
  let inDialogue = false;
  let inDualDialogue = false;
  let dialoguePosition = 0;
  let dialogueContent: MarkupContent[] = [];
  let frontMatterPositionContent: Record<string, MarkupContent[]> = {};
  let frontMatterFieldCaptureBlocks: MarkupContent[] = [];
  let frontMatterKeyword = "";
  let inFrontMatter = false;

  tree.iterate({
    from,
    to,
    enter: (nodeRef) => {
      const name = nodeRef.name as SparkdownNodeName;
      const from = nodeRef.from;
      const to = nodeRef.to;
      if (name === "Newline") {
        processNewline(nodeRef.from, nodeRef.to);
      }
      if (name === "FrontMatter") {
        frontMatterPositionContent = {};
        inFrontMatter = true;
      } else if (name === "FrontMatterField") {
        frontMatterFieldCaptureBlocks = [];
        frontMatterKeyword = "";
      } else if (name === "FrontMatterFieldKeyword") {
        const value = doc.sliceString(from, to).trim();
        frontMatterKeyword = value;
        return false;
      } else if (name === "FrontMatterString") {
        const value = doc.sliceString(from, to).trim();
        frontMatterFieldCaptureBlocks.push({
          type: frontMatterKeyword.toLowerCase(),
          from,
          to,
          value,
          markdown: true,
          attributes: {
            style: "min-height: 1em",
          },
        });
        return false;
      } else if (name === "BlockDialogue" || name === "InlineDialogue") {
        inDialogue = true;
        dialoguePosition = 0;
        dialogueContent = [];
      } else if (name === "DialogueCharacter") {
        const value = doc.sliceString(from, to).trim();
        dialogueContent.push({
          type: "character",
          from,
          to,
          value: value + ": ",
          markdown: true,
          attributes: {
            style: getDialogueLineStyle("character"),
          },
        });
        const side = declarationName(nodeRef, "DialogueCharacterPositionContent");
        inDualDialogue = side !== "";
        dialoguePosition =
          side === "<" || side === "left" || side === "l"
            ? 1
            : side === ">" || side === "right" || side === "r"
              ? 2
              : 0;
      } else if (name === "TextChunk") {
        if (inDialogue) {
          const value = printedSlice(from, to).trimEnd();
          const directiveOnly = isOnlyHiddenDirectives(value);
          dialogueContent.push({
            type: "dialogue",
            from,
            to,
            value,
            markdown: true,
            attributes: {
              style: directiveOnly
                ? "display: none;"
                : getDialogueLineStyle("dialogue"),
            },
          });
        }
      } else if (name === "ParentheticalLineContent") {
        if (inDialogue) {
          const value = doc.sliceString(from, to).trim();
          dialogueContent.push({
            type: "parenthetical",
            from,
            to,
            value,
            markdown: true,
            attributes: {
              style: getDialogueLineStyle("parenthetical"),
            },
          });
        }
      } else if (name === "Scene") {
        const sceneName = config?.screenplay_print_scene_identifiers
          ? declarationName(nodeRef, "SceneDeclarationName")
          : "";
        decorations.push(
          ...createDecorations(
            doc,
            sceneName
              ? { type: "name", from, to, name: sceneName, pageBreak: true }
              : { type: "page_break", from, to },
          ),
        );
        return false;
      } else if (
        name === "Branch" &&
        nodeRef.node.parent?.name === "sparkdown" &&
        config?.screenplay_print_branch_identifiers &&
        declarationName(nodeRef, "BranchDeclarationName")
      ) {
        decorations.push(
          ...createDecorations(doc, {
            type: "name",
            from,
            to: blockEnd(nodeRef),
            name: declarationName(nodeRef, "BranchDeclarationName"),
            pageBreak: false,
          }),
        );
        handledLines.add(doc.lineAt(from).number);
        lineStart = nodeRef.to;
        return false;
      } else if (isLeadingIndent(name, from, to)) {
        const indentLine = doc.lineAt(from);
        if (indentLine.from === from && /^[ \t]*$/.test(indentLine.text)) {
          return false;
        }
        hideInlineRange(nodeRef);
        return false;
      } else if (name === "Break") {
        hideInlineRange(nodeRef);
        return false;
      } else if (name === "ColonSeparator") {
        hideInlineRange(nodeRef);
        return false;
      } else if (
        isBlankLine(nodeRef) &&
        isLuauFlowBlockContainer(name) &&
        opensOwnLine(nodeRef)
      ) {
        hideLines(from, from);
        return true;
      } else if (isBlankLine(nodeRef) && holdsPrintedText(from, to)) {
        const line = doc.lineAt(from);
        if (!handledLines.has(line.number) && blankLines.has(line.number)) {
          decorations.push(
            Decoration.widget({
              widget: new CollapseWidget({ type: "collapse", from: line.from, to: line.from }),
              block: true,
              side: -1,
            }).range(line.from),
          );
        }
        handledLines.add(line.number);
        return true;
      } else if (isBlankLine(nodeRef)) {
        const functionName = config?.screenplay_print_function_identifiers
          ? rootFunctionName(nodeRef.node, (from, to) => doc.sliceString(from, to))
          : "";
        hideLines(from, blockEnd(nodeRef), functionName, nodeRef.node);
        lineStart = nodeRef.to;
        return false;
      } else if (name === "BlockWrite" || name === "InlineWrite") {
        hideLines(from, blockEnd(nodeRef));
        lineStart = nodeRef.to;
        return false;
      } else if (isUnprinted(nodeRef)) {
        hideInlineRange(nodeRef);
        return false;
      } else if (name === "LuauSparkdownAlternatorArm") {
        decorations.push(...createDecorations(doc, { type: "reveal", from, to }));
        return true;
      } else if (isCentered(nodeRef)) {
        centerRange(nodeRef);
        return true;
      } else if (isInlineHidden(nodeRef)) {
        hideInlineRange(nodeRef);
      }
      return true;
    },
    leave: (nodeRef) => {
      const name = nodeRef.name as SparkdownNodeName;
      const from = nodeRef.from;
      const to = nodeRef.to;
      if (name === "FrontMatter") {
        inFrontMatter = false;
        if (config?.screenplay_print_title_page === false) {
          hideLines(from, blockEnd(nodeRef));
          lineStart = nodeRef.to;
          return;
        }
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
        decorations.push(
          ...createDecorations(doc, {
            type: "title_page",
            from,
            to,
            language: LANGUAGE_SUPPORT.language,
            highlighter: LANGUAGE_HIGHLIGHTS,
            ...frontMatterPositionContent,
          }),
        );
      } else if (name === "FrontMatterField") {
        const firstCaptureBlock = frontMatterFieldCaptureBlocks[0];
        const lastCaptureBlock =
          frontMatterFieldCaptureBlocks[
            frontMatterFieldCaptureBlocks.length - 1
          ];
        if (firstCaptureBlock) {
          firstCaptureBlock.attributes = {
            style: "margin: 1em 0 0 0",
          };
        }
        if (lastCaptureBlock) {
          lastCaptureBlock.attributes = { style: "margin: 0 0 1em 0" };
        }
        const position =
          PAGE_POSITIONS[
            ("meta:" +
              frontMatterKeyword.toLowerCase()) as keyof typeof PAGE_POSITIONS
          ];
        if (position) {
          frontMatterPositionContent[position] ??= [];
          frontMatterPositionContent[position]!.push(
            ...frontMatterFieldCaptureBlocks,
          );
        }
      } else if (name === "BlockTitle" || name === "InlineTitle") {
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
      } else if (name === "BlockHeading" || name === "InlineHeading") {
        sceneNumber += 1;
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
          Decoration.line({
            class: "sp-heading",
            attributes: { "data-scene-number": String(sceneNumber) },
          }).range(doc.lineAt(from).from),
        );
      } else if (
        name === "BlockTransitional" ||
        name === "InlineTransitional"
      ) {
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
      } else if (
        name === "BlockAction" ||
        name === "InlineAction" ||
        name === "ImplicitAction"
      ) {
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
      } else if (name === "Choice") {
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
        const optionLine = doc.lineAt(from);
        decorations.push(
          Decoration.line({
            class: picks?.has(optionLine.number - 1)
              ? "sp-option sp-chosen"
              : "sp-option",
          }).range(optionLine.from),
        );
      } else if (name === "BlockDialogue" || name === "InlineDialogue") {
        if (inDualDialogue) {
          const isOdd = dialoguePosition % 2 !== 0;
          if (isOdd) {
            const contentEnd = findBlockContentEnd(from, to);
            const spec: DialogueSpec = {
              type: "dialogue",
              from,
              to: contentEnd,
              language: LANGUAGE_SUPPORT.language,
              highlighter: DUAL_LANGUAGE_HIGHLIGHTS,
              blocks: [
                dialogueContent.map((c) => {
                  c.attributes = {
                    style: getDualDialogueLineStyle(c.type),
                  };
                  return c;
                }),
              ],
              grid: true,
            };
            decorations.push(...createDecorations(doc, spec));
            prevDialogueSpec = spec;
          } else if (prevDialogueSpec && prevDialogueSpec.blocks) {
            const contentEnd = findBlockContentEnd(from, to);
            prevDialogueSpec.grid = true;
            prevDialogueSpec.to = contentEnd;
            prevDialogueSpec.blocks.push(dialogueContent);
            prevDialogueSpec.blocks.forEach((blocks) => {
              blocks.forEach((block) => {
                block.attributes = {
                  style: getDualDialogueLineStyle(block.type),
                };
              });
            });
            decorations.push(
              ...createDecorations(doc, {
                type: "reveal",
                from,
                to: contentEnd,
              }),
              ...createDecorations(doc, {
                type: "replace",
                from,
                to: contentEnd,
              }),
            );
          }
        } else {
          const spec: DialogueSpec = {
            type: "dialogue",
            from,
            to,
            language: LANGUAGE_SUPPORT.language,
            highlighter: LANGUAGE_HIGHLIGHTS,
            blocks: [dialogueContent],
            grid: name === "InlineDialogue",
          };
          decorations.push(...createDecorations(doc, spec));
          prevDialogueSpec = spec;
          dialoguePosition = 0;
        }
        inDialogue = false;
        inDualDialogue = false;
      }
    },
  });

  highlightTree(
    tree,
    [LANGUAGE_HIGHLIGHTS],
    (from, to, style) => {
      const line = doc.lineAt(from);
      if (line.from === from && isWhitespaceOnly(line.from, line.to)) {
        return;
      }
      decorations.push(Decoration.mark({ class: style }).range(from, to));
    },
    from,
    to,
  );

  return decorations;
};

const replaceDecorations = StateField.define<DecorationSet>({
  create(state) {
    const ranges = decorate(state);
    const decorations =
      ranges.length > 0 ? RangeSet.of(ranges, true) : Decoration.none;
    return decorations;
  },
  update(decorations, transaction) {
    if (!transaction.docChanged) {
      const { startState, state } = transaction;
      const unchanged =
        syntaxTree(startState) === syntaxTree(state) &&
        startState.field(screenplayConfigField, false) ===
          state.field(screenplayConfigField, false) &&
        startState.field(screenplayPicksField, false) ===
          state.field(screenplayPicksField, false);
      if (unchanged) return decorations;
    }
    const ranges = decorate(transaction.state);
    return ranges.length > 0 ? RangeSet.of(ranges, true) : Decoration.none;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

const screenplayFormatting = (): Extension => {
  return [
    LANGUAGE_SUPPORT,
    replaceDecorations,
    EditorView.styleModule.of(LANGUAGE_HIGHLIGHTS.module!),
    EditorView.styleModule.of(DUAL_LANGUAGE_HIGHLIGHTS.module!),
  ];
};

export default screenplayFormatting;
