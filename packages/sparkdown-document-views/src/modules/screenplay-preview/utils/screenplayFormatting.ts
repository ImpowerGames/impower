import { HighlightStyle, syntaxTree } from "@codemirror/language";
import type { EditorState, Text } from "@codemirror/state";
import { Extension, Range, RangeSet, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { VSCodeLanguageSupport } from "@impower/codemirror-vscode-language/src";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { SyntaxNodeRef } from "@lezer/common";
import { getStyleTags, highlightTree, tags } from "@lezer/highlight";
import { PAGE_POSITIONS } from "../../../../../sparkdown-screenplay/src/constants/PAGE_POSITIONS";
import GRAMMAR from "../../../../../sparkdown/language/sparkdown.language-grammar.json";
import CollapseWidget from "../classes/widgets/CollapseWidget";
import DialogueWidget, {
  DialogueSpec,
} from "../classes/widgets/DialogueWidget";
import PageBreakWidget from "../classes/widgets/PageBreakWidget";
import TitlePageWidget, {
  TitlePageSpec,
} from "../classes/widgets/TitlePageWidget";
import { CollapseSpec } from "../types/CollapseSpec";
import { MarkSpec } from "../types/MarkSpec";
import { MarkupContent } from "../types/MarkupContent";
import { PageBreakSpec } from "../types/PageBreakSpec";
import { ReplaceSpec } from "../types/ReplaceSpec";
import { RevealSpec } from "../types/RevealSpec";

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
  | PageBreakSpec;

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
];

const createHighlightStyle = (inlineHiddenStyle: Record<string, string>) =>
  HighlightStyle.define([
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.link, textDecoration: "underline", textUnderlineOffset: "5px" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.regexp, fontWeight: "bold" },
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

// display:none rather than visibility:hidden so a line whose ONLY content is
// inline-hidden (e.g. a directive-only line `[[show backdrop]]` inside a
// dialogue block, or a stray `// comment` line) does not generate a line-box
// and therefore does not occupy line-height of vertical space. The dual
// dialogue highlight style below already uses display:none for this reason.
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

export const decorate = (
  state: EditorState,
  from: number = 0,
  to?: number,
  treeOverride?: import("@lezer/common").Tree,
) => {
  let prevDialogueSpec: DialogueSpec | undefined = undefined;
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  // Returns true if the text is composed only of inline-hidden directive
  // markers — `[[image]]`, `((audio))`, `<directive>` — and whitespace.
  // Used to detect dialogue lines whose source is metadata-only so we
  // can collapse the wrapping cm-line and not have it occupy a row of
  // vertical space that visually competes with the inter-block blank
  // line separator.
  const isOnlyHiddenDirectives = (text: string): boolean => {
    const stripped = text
      .replace(/\[\[[^\]]*\]\]/g, "")
      .replace(/\(\([^)]*\)\)/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    return stripped.length === 0 && text.trim().length > 0;
  };

  // Block nodes (BlockDialogue, ...) include any trailing
  // whitespace-only "blank" lines inside their range. When a block is
  // rendered via a widget-replace (dual dialogue), consuming the whole
  // range absorbs the blank line that would have visually separated
  // this block from the next one. Walk backward from `to` to find the
  // position right after the last content line's terminating newline,
  // so the widget stops there and the trailing blank line(s) remain as
  // their own cm-lines (default theme opacity:0 still gives them a
  // line-height of vertical space — the visible separator).
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

  const isBlockHidden = (nodeRef: SyntaxNodeRef) => {
    const name = nodeRef.name as SparkdownNodeName;
    if (nodeRef.node.parent?.name === "sparkdown") {
      // This is a top-level node
      return (
        name !== "FrontMatter" &&
        name !== "Function" && // TODO: Only hide if config doesn't print function
        name !== "Scene" && // TODO: Only hide if config doesn't print scene
        // name !== "Branch" && // TODO: Only hide if config doesn't print branch
        name !== "Knot" && // TODO: Only hide if config doesn't print knot
        // name !== "Stitch" && // TODO: Only hide if config doesn't print stitch
        name !== "BlockTitle" &&
        name !== "InlineTitle" &&
        name !== "BlockHeading" &&
        name !== "InlineHeading" &&
        name !== "BlockTransitional" &&
        name !== "InlineTransitional" &&
        name !== "BlockWrite" &&
        name !== "InlineWrite" &&
        name !== "BlockDialogue" &&
        name !== "InlineDialogue" &&
        name !== "BlockAction" &&
        name !== "InlineAction" &&
        name !== "ImplicitAction" &&
        name !== "Choice" &&
        name !== "Newline" &&
        name !== "Whitespace"
      );
    }
    return false;
  };

  const isInlineHidden = (nodeRef: SyntaxNodeRef) => {
    const result = getStyleTags(nodeRef);
    return result?.tags.some((t) => INLINE_HIDDEN_TAGS.includes(t));
  };

  const hideBlockRange = (nodeRef: SyntaxNodeRef) => {
    const from = nodeRef.from;
    const to = nodeRef.to;
    const text = doc.sliceString(from, to);
    const hiddenNodeEndsWithNewline = text.endsWith("\n");
    const hideFrom = from;
    const hideTo = hiddenNodeEndsWithNewline ? to - 1 : to;
    decorations.push(
      ...createDecorations(doc, {
        type: "collapse",
        from: hideFrom,
        to: hideTo,
      }),
    );
    // After hiding a block (which collapses a range of source positions to
    // a single zero-height widget), advance the line cursor past the
    // consumed range so the next Newline visit doesn't see a "blank"
    // line that's actually inside the just-hidden block. DON'T also
    // call processNewline here — that synthesized call would invoke
    // isWhitespaceOnly(lineStart, lineStart - 1) which returns true
    // for the empty range (`end <= start`) and emits a spurious
    // separator collapse at the trailing line position. Across many
    // edits and incremental reparses the spurious collapses pile up,
    // producing the "many collapse classes on the trailing cm-line"
    // drift symptom.
    lineStart = nodeRef.to;
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

  // Source-based blank-line detection. Read the line text directly rather
  // than tracking a flag across node visits — the grammar wraps a
  // whitespace-only "blank" line as `BlockLineBlank > BlockLineBlank_c1 >
  // Indent`, and a flag-based approach would mis-classify those wrapper
  // nodes as "content" and drop the separator (visible as missing blank
  // line between consecutive dialogue blocks once the editor leaves indent
  // on the otherwise-empty line).
  const isWhitespaceOnly = (start: number, end: number): boolean => {
    if (end <= start) return true;
    const slice = doc.sliceString(start, end);
    for (let i = 0; i < slice.length; i++) {
      const c = slice.charCodeAt(i);
      if (c !== 0x20 && c !== 0x09) return false;
    }
    return true;
  };

  let lineStart = from;
  // Workaround for a textmate-grammar-tree incremental parser bug:
  // after each reparse, duplicate `Newline` nodes accumulate at the
  // trailing edge of the document (one extra per reparse). Each
  // duplicate triggered processNewline with lineStart already past
  // the newline, hit isWhitespaceOnly's `end <= start` short-circuit,
  // and emitted a spurious `Decoration.line({class:"collapse"})` at
  // the trailing line — the user-visible "preview deletes the old
  // line and replaces it with the new one" sync drift.
  //
  // A proper fix exists on another branch of textmate-grammar-tree but
  // hasn't been merged upstream as of 2026-05-29. When that lands and
  // the parser stops emitting duplicates, this Set guard becomes a
  // no-op and can be removed.
  const seenNewlineFrom = new Set<number>();
  const processNewline = (newlineFrom: number, newlineTo: number) => {
    if (seenNewlineFrom.has(newlineFrom)) return;
    seenNewlineFrom.add(newlineFrom);
    if (isWhitespaceOnly(lineStart, newlineFrom)) {
      decorations.push(
        ...createDecorations(doc, {
          type: "collapse",
          from: lineStart,
          to: newlineFrom,
          separator: true,
        }),
      );
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
  const inConditionalBlock: boolean[] = [];

  const tree = treeOverride ?? syntaxTree(state);

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
      } else if (name === "ConditionalBracedBlock") {
        inConditionalBlock.push(true);
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
      } else if (name === "DialogueCharacterPositionContent") {
        const value = doc.sliceString(from, to).trim();
        if (value) {
          inDualDialogue = true;
          if (value === "<" || value === "left" || value === "l") {
            dialoguePosition = 1;
          }
          if (value === ">" || value === "right" || value === "r") {
            dialoguePosition = 2;
          }
        } else {
          inDualDialogue = false;
          dialoguePosition = 0;
        }
      } else if (name === "TextChunk") {
        if (inDialogue) {
          const value = doc.sliceString(from, to).trimEnd();
          // A dialogue line whose source is only inline-hidden
          // directives (`[[image]]`, `((audio))`, `<directive>`) still
          // gets a dialogue line decoration with display:block — which
          // contributes a full line-height of vertical space, making
          // it visually indistinguishable from the real blank-line
          // separator that ends the block. Push the line with
          // display:none so it doesn't take a row, while still keeping
          // the source character offsets intact for selection and
          // tree mapping.
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
      } else if (name === "Function") {
        decorations.push(
          ...createDecorations(doc, {
            type: "page_break",
            from,
            to,
          }),
        );
        return false;
      } else if (name === "Scene") {
        decorations.push(
          ...createDecorations(doc, {
            type: "page_break",
            from,
            to,
          }),
        );
        return false;
      } else if (name === "Knot") {
        decorations.push(
          ...createDecorations(doc, {
            type: "page_break",
            from,
            to,
          }),
        );
        return false;
      } else if (name === "Indent" && inConditionalBlock.length === 0) {
        // If the Indent is the entire content of a whitespace-only line
        // (an indented "blank" line — what the editor leaves when the
        // user types into an indented block and then deletes back to
        // nothing), DON'T replace it. Leaving the source whitespace as-is
        // gives the cm-line a natural 1em line-box because there's real
        // text content anchoring it. The base `.cm-line { opacity: 0 }`
        // rule keeps that whitespace invisible. Without this skip, the
        // Indent gets a Decoration.replace, the cm-line ends up with
        // only widget buffers as children, CodeMirror skips `<br>`
        // injection, and the line collapses to zero height — making the
        // indented blank render differently from a truly-empty blank
        // (the latter gets `<br>` because CodeMirror sees no children).
        const indentLine = doc.lineAt(from);
        if (indentLine.from === from && /^[ \t]*$/.test(indentLine.text)) {
          return false;
        }
        hideInlineRange(nodeRef);
        return false;
      } else if (name === "Break") {
        // BREAK marker (`>` at end of a dialogue/action line) is a logical
        // continuation marker, never displayed. The PDF parser drops it
        // before token text is emitted; the preview must too.
        hideInlineRange(nodeRef);
        return false;
      } else if (name === "ColonSeparator") {
        // The `:` after a character cue (BUNNY:) is grammar — the PDF
        // parser emits the cue name without it, and the dialogue widget
        // re-adds it visually when rendering. Hide the source `:` so the
        // raw character cue doesn't show double-colon.
        hideInlineRange(nodeRef);
        return false;
      } else if (isCentered(nodeRef)) {
        centerRange(nodeRef);
        return true;
      } else if (isBlockHidden(nodeRef)) {
        hideBlockRange(nodeRef);
        return false;
      } else if (isInlineHidden(nodeRef) && inConditionalBlock.length === 0) {
        hideInlineRange(nodeRef);
      }
      return true;
    },
    leave: (nodeRef) => {
      const name = nodeRef.name as SparkdownNodeName;
      const from = nodeRef.from;
      const to = nodeRef.to;
      if (name === "FrontMatter") {
        // Add FrontMatter Spec
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
        // Add Title Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
      } else if (name === "BlockHeading" || name === "InlineHeading") {
        // Add Heading Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
      } else if (
        name === "BlockTransitional" ||
        name === "InlineTransitional"
      ) {
        // Add Transitional Spec
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
        // Add Action Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
      } else if (name === "Choice") {
        // Add Choice Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          }),
        );
      } else if (name === "BlockDialogue" || name === "InlineDialogue") {
        if (inDualDialogue) {
          const isOdd = dialoguePosition % 2 !== 0;
          if (isOdd) {
            // left (odd position)
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
            // right (even position)
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
            // Reveal the right side's lines too — PREVIEW_THEME sets
            // `.cm-line { opacity: 0 }` as the default, and the only way
            // a cm-line becomes visible is via a reveal line decoration.
            // The left side's reveal happens to make the FIRST pair
            // visible because CodeMirror collapses adjacent replace
            // ranges onto the left's cm-line, but consecutive pairs in
            // a back-to-back dual block don't share that cm-line, so
            // the second pair stays at opacity:0 if we only reveal the
            // left. createDecorations for "reveal" emits one line
            // decoration per source line in the range. Use contentEnd
            // (not `to`) so the trailing blank line stays as its own
            // cm-line and provides visible separation from the next
            // block.
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
      } else if (name === "ConditionalBracedBlock") {
        inConditionalBlock.pop();
      }
    },
  });

  highlightTree(
    tree,
    [LANGUAGE_HIGHLIGHTS],
    (from, to, style) => {
      decorations.push(Decoration.mark({ class: style }).range(from, to));
    },
    from,
    to,
  );


  // console.log("REPARSED TREE");
  // console.log(printTree(tree, doc.toString(), { from, to }));

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
      const oldTree = syntaxTree(transaction.startState);
      const newTree = syntaxTree(transaction.state);
      if (oldTree === newTree) return decorations;
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
