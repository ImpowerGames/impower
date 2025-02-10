import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import type { EditorState, Text } from "@codemirror/state";
import { Extension, Range, RangeSet, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { tags, highlightTree } from "@lezer/highlight";
import { SyntaxNodeRef } from "@lezer/common";
import GRAMMAR from "../../../../../sparkdown/language/sparkdown.language-grammar.json";
import { PAGE_POSITIONS } from "../../../../../sparkdown-screenplay/src/constants/PAGE_POSITIONS";
import { SparkdownNodeName } from "../../../../../sparkdown/src/types/SparkdownNodeName";
import TextmateLanguageSupport from "../../../cm-textmate/classes/TextmateLanguageSupport";
import DialogueWidget, {
  DialogueSpec,
} from "../classes/widgets/DialogueWidget";
import TitlePageWidget from "../classes/widgets/TitlePageWidget";
import { MarkupContent } from "../types/MarkupContent";
import { ReplaceSpec } from "../types/ReplaceSpec";
import { RevealSpec } from "../types/RevealSpec";
import { printTree } from "../../../cm-textmate/utils/printTree";

const DIALOGUE_WIDTH = "60%";
const CHARACTER_PADDING = "16%";
const PARENTHETICAL_PADDING = "8%";

const DUAL_DIALOGUE_WIDTH = "90%";
const DUAL_CHARACTER_PADDING = "16%";
const DUAL_PARENTHETICAL_PADDING = "8%";

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

const LANGUAGE_SUPPORT = new TextmateLanguageSupport(LANGUAGE_NAME, GRAMMAR);

const LANGUAGE_HIGHLIGHTS = HighlightStyle.define([
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, textDecoration: "underline", textUnderlineOffset: "5px" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.regexp, fontWeight: "bold" },
  { tag: tags.labelName, display: "block", textAlign: "right" },

  {
    tag: tags.special(tags.meta),
    display: "block",
    maxHeight: "0",
    visibility: "hidden",
  },
  { tag: tags.definition(tags.escape), display: "none" },
  { tag: tags.definition(tags.keyword), display: "none" },
  { tag: tags.definition(tags.controlKeyword), display: "none" },
  { tag: tags.definition(tags.typeName), display: "none" },
  { tag: tags.definition(tags.variableName), display: "none" },
  { tag: tags.definition(tags.propertyName), display: "none" },
  { tag: tags.definition(tags.punctuation), display: "none" },
  { tag: tags.definition(tags.content), display: "none" },
  { tag: tags.definition(tags.separator), display: "none" },
  { tag: tags.special(tags.content), display: "none" },
  { tag: tags.comment, display: "none" },
  { tag: tags.blockComment, display: "none" },
  { tag: tags.docComment, display: "none" },

  { tag: tags.macroName, display: "none" },
  { tag: tags.meta, display: "none" },

  {
    tag: tags.contentSeparator,
    display: "block",
    color: "transparent",
    borderBottom: "1px solid #00000033",
  },
]);

const HIDDEN_NODE_NAMES: SparkdownNodeName[] = [
  "Comment",
  "LineComment",
  "BlockComment",
  "Tag",
  "Logic",
  "Knot",
  "Stitch",
  "VarDeclaration",
  "ListDeclaration",
  "ConstDeclaration",
  "ExternalDeclaration",
  "DefineDeclaration",
  "AudioLine",
  "ImageLine",
  "ImageAndAudioLine",
  "Unknown",
];

const createDecorations = (
  spec: ReplaceSpec | RevealSpec,
  doc: Text
): Range<Decoration>[] => {
  if (spec.type === "reveal") {
    return [
      Decoration.line({
        attributes: { style: "opacity: 1" },
      }).range(doc.lineAt(spec.from + 1).from),
    ];
  }
  if (spec.widget === DialogueWidget) {
    const dialogueSpec = spec as DialogueSpec;
    if (!dialogueSpec.grid) {
      const blocks = dialogueSpec.blocks[0];
      if (blocks) {
        return blocks.map((b) =>
          Decoration.line({
            attributes: b.attributes,
          }).range(doc.lineAt(b.from + 1).from)
        );
      }
    }
  }
  if (spec.content && !spec.block) {
    return spec.content.map((b) =>
      b.attributes
        ? Decoration.mark({
            attributes: b.attributes,
          }).range(spec.from, spec.to)
        : Decoration.replace({}).range(spec.from, spec.to)
    );
  }
  return [
    Decoration.replace({
      widget: spec.widget ? new spec.widget(spec) : undefined,
      block: spec.block,
    }).range(spec.from, spec.to),
  ];
};

const decorate = (state: EditorState) => {
  let prevDialogueSpec: DialogueSpec | undefined = undefined;
  const specs: (ReplaceSpec | RevealSpec)[] = [];
  const doc = state.doc;

  const isCentered = (nodeRef: SyntaxNodeRef) => {
    const name = nodeRef.name as SparkdownNodeName;
    if (name === "Centered") {
      return true;
    }
    return false;
  };

  const centerRange = (nodeRef: SyntaxNodeRef, treeFrom: number = 0) => {
    const name = nodeRef.name as SparkdownNodeName;
    const from = treeFrom + nodeRef.from;
    const to = from + (nodeRef.to - nodeRef.from);
    specs.push({
      type: "replace",
      from,
      to,
      content: [
        {
          type: name,
          from,
          to,
          attributes: {
            style: "display: block; opacity: 1; text-align: center;",
          },
        },
      ],
    });
  };

  const isHidden = (nodeRef: SyntaxNodeRef) => {
    const name = nodeRef.name as SparkdownNodeName;
    if (nodeRef.node.parent?.name === LANGUAGE_NAME) {
      // This is a top-level node
      if (name === "Divert") {
        return true;
      }
    }
    if (HIDDEN_NODE_NAMES.includes(name)) {
      return true;
    }
    return false;
  };

  const hideRange = (nodeRef: SyntaxNodeRef, treeFrom: number = 0) => {
    const from = treeFrom + nodeRef.from;
    const to = from + (nodeRef.to - nodeRef.from);
    const hiddenNodeEndsWithNewline = doc.sliceString(from, to).endsWith("\n");
    const nextLineAt = hiddenNodeEndsWithNewline ? to : to + 1;
    const nextLine =
      nextLineAt < doc.length - 1 ? doc.lineAt(nextLineAt) : null;
    const nextLineIsBlank =
      nextLine && doc.sliceString(nextLine.from, nextLine.to).trim() === "";
    const hideFrom = from;
    const hideTo = nextLineIsBlank
      ? nextLine.to
      : hiddenNodeEndsWithNewline
      ? to - 1
      : to;
    specs.push({
      type: "replace",
      from: hideFrom,
      to: hideTo,
      block: true,
      language: LANGUAGE_SUPPORT.language,
      highlighter: LANGUAGE_HIGHLIGHTS,
    });
  };

  let inDualDialogue = false;
  let dialoguePosition = 0;
  let dialogueContent: MarkupContent[] = [];
  let frontMatterPositionContent: Record<string, MarkupContent[]> = {};
  let frontMatterFieldCaptureBlocks: MarkupContent[] = [];
  let frontMatterKeyword = "";

  const stack: SparkdownNodeName[] = [];

  const tree = syntaxTree(state);
  tree.iterate({
    enter: (nodeRef) => {
      const name = nodeRef.name as SparkdownNodeName;
      const from = nodeRef.node.from;
      const to = nodeRef.node.to;
      stack.push(name);
      if (name === "FrontMatter") {
        frontMatterPositionContent = {};
      }
      if (name === "FrontMatterField") {
        frontMatterFieldCaptureBlocks = [];
        frontMatterKeyword = "";
      }
      if (name === "FrontMatterFieldKeyword") {
        const value = doc.sliceString(from, to).trim();
        frontMatterKeyword = value;
        return false;
      }
      if (name === "FrontMatterString") {
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
      }
      if (name === "Transition") {
        specs.push({
          type: "reveal",
          from,
          to,
        });
      }
      if (name === "Scene") {
        specs.push({
          type: "reveal",
          from,
          to,
        });
      }
      if (name === "Action") {
        specs.push({
          type: "reveal",
          from,
          to,
        });
      }
      if (name === "BlockDialogue") {
        dialoguePosition = 0;
        dialogueContent = [];
      }
      if (name === "InlineDialogue") {
        dialoguePosition = 0;
        dialogueContent = [];
      }
      if (name === "DialogueCharacter") {
        const value = doc.sliceString(from, to).trim();
        dialogueContent.push({
          type: "character",
          from,
          to,
          value: "@ " + value,
          markdown: true,
          attributes: {
            style: getDialogueLineStyle("character"),
          },
        });
      }
      if (name === "DialogueCharacterPositionContent") {
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
      }
      if (name === "TextChunk") {
        if (
          stack.includes("BlockDialogue") ||
          stack.includes("InlineDialogue")
        ) {
          const value = doc.sliceString(from, to).trimEnd();
          dialogueContent.push({
            type: "dialogue",
            from,
            to,
            value,
            markdown: true,
            attributes: {
              style: getDialogueLineStyle("dialogue"),
            },
          });
        }
      }
      if (name === "ParentheticalLineContent") {
        if (
          stack.includes("BlockDialogue") ||
          stack.includes("InlineDialogue")
        ) {
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
        } else {
          specs.push({
            type: "replace",
            from,
            to,
            content: [
              {
                type: name,
                from,
                to,
              },
            ],
          });
        }
      }
      if (isCentered(nodeRef)) {
        centerRange(nodeRef);
      }
      if (isHidden(nodeRef)) {
        hideRange(nodeRef);
        return false;
      }
      return true;
    },
    leave: (nodeRef) => {
      const name = nodeRef.name as SparkdownNodeName;
      const from = nodeRef.node.from;
      const to = nodeRef.node.to;
      if (name === "FrontMatter") {
        // Add FrontMatter Spec
        specs.push({
          type: "replace",
          from,
          to,
          block: true,
          widget: TitlePageWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          ...frontMatterPositionContent,
        });
      }
      if (name === "FrontMatterField") {
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
            frontMatterKeyword.toLowerCase() as keyof typeof PAGE_POSITIONS
          ];
        if (position) {
          frontMatterPositionContent[position] ??= [];
          frontMatterPositionContent[position]!.push(
            ...frontMatterFieldCaptureBlocks
          );
        }
      }
      if (name === "BlockDialogue" || name === "InlineDialogue") {
        // Add Dialogue Spec
        if (inDualDialogue) {
          const isOdd = dialoguePosition % 2 !== 0;
          if (isOdd) {
            // left (odd position)
            const spec: DialogueSpec = {
              type: "replace",
              from,
              to: to - 1,
              widget: DialogueWidget,
              language: LANGUAGE_SUPPORT.language,
              highlighter: LANGUAGE_HIGHLIGHTS,
              block: true,
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
            specs.push(spec);
            prevDialogueSpec = spec;
          } else if (prevDialogueSpec && prevDialogueSpec.blocks) {
            // right (even position)
            prevDialogueSpec.grid = true;
            prevDialogueSpec.to = to - 1;
            prevDialogueSpec.blocks.push(dialogueContent);
            prevDialogueSpec.blocks.forEach((blocks) => {
              blocks.forEach((block) => {
                block.attributes = {
                  style: getDualDialogueLineStyle(block.type),
                };
              });
            });
          }
        } else {
          const spec: DialogueSpec = {
            type: "replace",
            from,
            to,
            widget: DialogueWidget,
            language: LANGUAGE_SUPPORT.language,
            highlighter: LANGUAGE_HIGHLIGHTS,
            block: true,
            blocks: [dialogueContent],
            grid: stack.includes("InlineDialogue"),
          };
          specs.push(spec);
          prevDialogueSpec = spec;
          dialoguePosition = 0;
        }
        inDualDialogue = false;
      }
      stack.pop();
    },
  });
  // Add replacement decorations
  const decorations = specs.flatMap((b) => createDecorations(b, doc));
  const rangeSet = RangeSet.of(decorations, true);
  return specs.length > 0 ? rangeSet : Decoration.none;
};

const replaceDecorations = StateField.define<DecorationSet>({
  create(state) {
    return decorate(state) ?? Decoration.none;
  },
  update(value, transaction) {
    if (
      transaction.docChanged ||
      syntaxTree(transaction.startState) != syntaxTree(transaction.state)
    ) {
      return decorate(transaction.state) ?? value;
    }
    return value;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

const screenplayFormatting = (): Extension => {
  return [
    LANGUAGE_SUPPORT,
    replaceDecorations,
    syntaxHighlighting(LANGUAGE_HIGHLIGHTS),
  ];
};

export default screenplayFormatting;
