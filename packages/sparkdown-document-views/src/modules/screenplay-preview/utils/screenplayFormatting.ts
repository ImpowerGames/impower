import {
  DocInput,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import type { EditorState, Text } from "@codemirror/state";
import { Extension, Range, RangeSet, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import GRAMMAR from "../../../../../sparkdown/language/sparkdown.language-grammar.json";
import { FRONTMATTER_POSITIONS } from "../../../../../sparkdown/src/constants/FRONTMATTER_POSITIONS";
import { SparkdownNodeName } from "../../../../../sparkdown/src/types/SparkdownNodeName";
import TextmateLanguageSupport from "../../../cm-textmate/classes/TextmateLanguageSupport";
import DialogueWidget, {
  DialogueSpec,
} from "../classes/widgets/DialogueWidget";
import TitlePageWidget from "../classes/widgets/TitlePageWidget";
import { MarkupContent } from "../types/MarkupContent";
import { ReplaceSpec } from "../types/ReplaceSpec";
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
  return `margin: 0 auto; width: ${dialogueWidth}; padding: 0 ${paddingRight} 0 ${paddingLeft};`;
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
  return `margin: 0 auto; width: ${dialogueWidth}; padding: 0 ${paddingRight} 0 ${paddingLeft};`;
};

const LANGUAGE_SUPPORT = new TextmateLanguageSupport("sparkdown", GRAMMAR);

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
  "Divert",
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
  spec: ReplaceSpec,
  doc: Text
): Range<Decoration>[] => {
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
      Decoration.line({
        attributes: b.attributes,
      }).range(doc.lineAt(b.from + 1).from)
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
  const specs: ReplaceSpec[] = [];
  const doc = state.doc;
  const input = new DocInput(doc);
  const tree = LANGUAGE_SUPPORT.language.parser.parse(input);
  // console.log(printTree(tree, input));

  let inFrontMatter = false;
  let frontMatterFrom = 0;
  let frontMatterPositionContent: Record<string, MarkupContent[]> = {};

  let inDialogue = false;
  let inDualDialogue = false;
  let inInlineDialogue = false;
  let dialoguePosition = 0;
  let dialogueFrom = 0;
  let dialogueContent: MarkupContent[] = [];

  const endFrontMatter = (to: number) => {
    if (inFrontMatter) {
      specs.push({
        from: frontMatterFrom,
        to,
        block: true,
        widget: TitlePageWidget,
        language: LANGUAGE_SUPPORT.language,
        highlighter: LANGUAGE_HIGHLIGHTS,
        ...frontMatterPositionContent,
      });
    }
    inFrontMatter = false;
  };

  const endDialogue = (to: number) => {
    if (inDialogue) {
      if (inDualDialogue) {
        const isOdd = dialoguePosition % 2 !== 0;
        if (isOdd) {
          // left (odd position)
          const spec: DialogueSpec = {
            from: dialogueFrom,
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
          from: dialogueFrom,
          to: to,
          widget: DialogueWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          block: true,
          blocks: [dialogueContent],
          grid: inInlineDialogue,
        };
        specs.push(spec);
        prevDialogueSpec = spec;
        dialoguePosition = 0;
      }
    }
    inDialogue = false;
    inDualDialogue = false;
    inInlineDialogue = false;
  };

  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (nodeRef) => {
      const type = nodeRef.node.type;
      const from = nodeRef.node.from;
      const to = nodeRef.node.to;
      const name = type.name as SparkdownNodeName;
      // console.log(name, doc.sliceString(from, to));
      if (name === "FrontMatter_begin") {
        inFrontMatter = true;
        frontMatterFrom = from;
        frontMatterPositionContent = {};
        return true;
      }
      if (name === "FrontMatterField") {
        const captureBlocks: MarkupContent[] = [];
        const childTree = nodeRef.node.tree || nodeRef.node.toTree();
        let keyword = "";
        childTree.iterate({
          enter: (captureNodeRef) => {
            const captureName = captureNodeRef.type.name as SparkdownNodeName;
            if (captureName === "FrontMatterField_begin_c1") {
              const captureLength = captureNodeRef.to - captureNodeRef.from;
              const captureFrom = from + captureNodeRef.from;
              const captureTo = captureFrom + captureLength;
              const value = doc.sliceString(captureFrom, captureTo).trim();
              keyword = value;
              return false;
            }
            if (captureName === "FrontMatterString") {
              const captureLength = captureNodeRef.to - captureNodeRef.from;
              const captureFrom = from + captureNodeRef.from;
              const captureTo = captureFrom + captureLength;
              const value = doc.sliceString(captureFrom, captureTo).trim();
              captureBlocks.push({
                type: keyword.toLowerCase(),
                from: captureFrom,
                to: captureTo,
                value,
                markdown: true,
                attributes: {
                  style: "min-height: 1em",
                },
              });
              return false;
            }
            return true;
          },
        });
        const firstCaptureBlock = captureBlocks[0];
        const lastCaptureBlock = captureBlocks[captureBlocks.length - 1];
        if (firstCaptureBlock) {
          firstCaptureBlock.attributes = {
            style: "margin: 1em 0 0 0",
          };
        }
        if (lastCaptureBlock) {
          lastCaptureBlock.attributes = { style: "margin: 0 0 1em 0" };
        }
        const position = FRONTMATTER_POSITIONS[keyword.toLowerCase()];
        if (position) {
          frontMatterPositionContent[position] ??= [];
          frontMatterPositionContent[position]!.push(...captureBlocks);
        }
        return false;
      }
      if (name === "FrontMatter_end") {
        endFrontMatter(to);
        return false;
      }
      if (name === "BlockDialogue_begin" || name === "InlineDialogue_begin") {
        inDialogue = true;
        inDualDialogue = false;
        inInlineDialogue = name === "InlineDialogue_begin";
        dialogueFrom = from;
        dialogueContent = [];
        return true;
      }
      if (name === "BlockDialogue_end" || name === "InlineDialogue_end") {
        endDialogue(to);
        return false;
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
        return true;
      }
      if (name === "DialogueCharacterPositionContent") {
        const value = doc.sliceString(from, to).trim();
        if (value) {
          inDualDialogue = true;
          if (value === "^") {
            dialoguePosition += 1;
          }
          if (value === "<" || value === "left") {
            dialoguePosition = 1;
          }
          if (value === ">" || value === "right") {
            dialoguePosition = 2;
          }
        } else {
          inDualDialogue = false;
          dialoguePosition = 0;
        }
        return false;
      }
      if (name === "ParentheticalLineContent") {
        const value = doc.sliceString(from, to).trim();
        if (inDialogue) {
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
            from,
            to,
            content: [
              {
                type: type.name,
                from,
                to,
                attributes: {
                  style: "text-align: center;",
                },
              },
            ],
          });
        }
        return false;
      }
      if (name === "TextChunk" && inDialogue) {
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
        return false;
      }
      if (name === "Centered") {
        specs.push({
          from,
          to,
          content: [
            {
              type: type.name,
              from,
              to,
              attributes: {
                style: "text-align: center;",
              },
            },
          ],
        });
        return false;
      }
      if (HIDDEN_NODE_NAMES.includes(name)) {
        const hiddenNodeEndsWithNewline = doc
          .sliceString(from, to)
          .endsWith("\n");
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
        const spec = {
          from: hideFrom,
          to: hideTo,
          block: true,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
        };
        specs.push(spec);
        return false;
      }
      return true;
    },
  });
  endFrontMatter(doc.length);
  endDialogue(doc.length);
  const decorations = specs.flatMap((b) => createDecorations(b, doc));
  const rangeSet = RangeSet.of(decorations, true);
  return specs.length > 0 ? rangeSet : Decoration.none;
};

const replaceDecorations = StateField.define<DecorationSet>({
  create(state) {
    return decorate(state) ?? Decoration.none;
  },
  update(value, transaction) {
    if (transaction.docChanged) {
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
