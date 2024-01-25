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
import SPARK_TOKEN_TAGS from "../../../../../sparkdown/src/constants/SPARK_TOKEN_TAGS";
import { SparkdownNodeName } from "../../../../../sparkdown/src/types/SparkdownNodeName";
import TextmateLanguageSupport from "../../../cm-textmate/classes/TextmateLanguageSupport";
import DialogueWidget, {
  DialogueSpec,
} from "../classes/widgets/DialogueWidget";
import TitlePageWidget from "../classes/widgets/TitlePageWidget";
import { MarkupBlock } from "../types/MarkupBlock";
import { ReplaceSpec } from "../types/ReplaceSpec";

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
  { tag: tags.quote, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  {
    tag: tags.link,
    textDecoration: "underline",
    textUnderlineOffset: "5px",
  },
  {
    tag: tags.strikethrough,
    textDecoration: "line-through",
  },
  { tag: tags.punctuation, display: "none" },
  { tag: tags.regexp, fontWeight: "bold" },
  { tag: tags.labelName, display: "block", textAlign: "right" },

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
  "Chunk",
  "Section",
  "Import",
  "Define",
  "Define",
  "Store",
  "Assign",
  "Delete",
  "If",
  "Repeat",
  "Image",
  "Audio",
  "Jump",
  "Unknown",
];

const FRONTMATTER_POSITIONS: Record<string, string> = {
  title: "cc",
  credit: "cc",
  author: "cc",
  source: "cc",
  notes: "bl",
  date: "br",
  contact: "br",
  revision: "br",
  copyright: "br",
  tl: "tl",
  tc: "tc",
  tr: "tr",
  cc: "cc",
  bl: "bl",
  br: "br",
};

const createDecorations = (
  spec: ReplaceSpec,
  doc: Text
): Range<Decoration>[] => {
  if (spec.widget === DialogueWidget) {
    const dialogueSpec = spec as DialogueSpec;
    if (dialogueSpec.content && !dialogueSpec.left && !dialogueSpec.right) {
      return dialogueSpec.content.map((b) => {
        return Decoration.line({
          attributes: b.attributes,
        }).range(doc.lineAt(b.from + 1).from);
      });
    }
  }
  if (!spec.block && spec.content) {
    return spec.content.map((b) => {
      return Decoration.line({
        attributes: b.attributes,
      }).range(doc.lineAt(b.from + 1).from);
    });
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

  let inFrontMatter = false;
  let frontMatterFrom = 0;
  let frontMatterPositionContent: Record<string, MarkupBlock[]> = {};

  let inDialogue = false;
  let inDualDialogue = false;
  let dialogueFrom = 0;
  let dialogueContent: MarkupBlock[] = [];

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
        if (prevDialogueSpec) {
          prevDialogueSpec.to = to - 2;
          prevDialogueSpec.left = prevDialogueSpec.content?.map((b) => ({
            ...b,
            attributes: { style: getDualDialogueLineStyle(b.type) },
          }));
          prevDialogueSpec.right = dialogueContent?.map((b) => ({
            ...b,
            attributes: { style: getDualDialogueLineStyle(b.type) },
          }));
          prevDialogueSpec.content = undefined;
        }
      } else {
        const spec: ReplaceSpec = {
          from: dialogueFrom,
          to: to - 1,
          widget: DialogueWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          block: true,
          content: dialogueContent,
        };
        specs.push(spec);
        prevDialogueSpec = spec;
      }
    }
    inDialogue = false;
    inDualDialogue = false;
  };

  tree.iterate({
    from: 0,
    to: doc.length,
    enter: (nodeRef) => {
      const type = nodeRef.node.type;
      const from = nodeRef.node.from;
      const to = nodeRef.node.to;
      const name = type.name as SparkdownNodeName;
      const tag = SPARK_TOKEN_TAGS[name];
      if (tag === "front_matter_start") {
        inFrontMatter = true;
        frontMatterFrom = from;
        frontMatterPositionContent = {};
        return true;
      }
      if (tag === "front_matter_field") {
        const captureBlocks: MarkupBlock[] = [];
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
            }
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
      if (tag === "front_matter_end") {
        endFrontMatter(to);
        return false;
      }
      if (tag === "dialogue_start") {
        inDialogue = true;
        inDualDialogue = false;
        dialogueFrom = from;
        dialogueContent = [];
        return true;
      }
      if (tag === "dialogue_end") {
        endDialogue(to);
        return false;
      }
      if (tag === "dialogue_character_name") {
        const value = doc.sliceString(from, to).trim();
        dialogueContent.push({
          type: "character",
          from,
          to,
          value,
          attributes: {
            style: getDialogueLineStyle("character"),
          },
        });
        return false;
      }
      if (tag === "dialogue_character_parenthetical") {
        const value = doc.sliceString(from, to).trim();
        const firstDialogueBlockLine = dialogueContent[0];
        if (firstDialogueBlockLine) {
          firstDialogueBlockLine.value += " " + value;
          firstDialogueBlockLine.to = to;
        }
        return false;
      }
      if (tag === "dialogue_character_simultaneous") {
        const value = doc.sliceString(from, to).trim();
        if (value) {
          inDualDialogue = true;
        }
        return false;
      }
      if (tag === "dialogue_line_parenthetical") {
        const value = doc.sliceString(from, to).trim();
        dialogueContent.push({
          type: "parenthetical",
          from,
          to,
          value,
          attributes: {
            style: getDialogueLineStyle("parenthetical"),
          },
        });
        return false;
      }
      if (
        (tag === "box_line_continue" || tag === "box_line_complete") &&
        inDialogue
      ) {
        const value = doc.sliceString(from, to).trim();
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
      if (tag === "centered") {
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
      if (tag === "flow_break") {
        return false;
      }
      if (tag === "transition") {
        return false;
      }
      if (tag === "scene") {
        return false;
      }
      if (tag === "action_box") {
        // TODO: Hide ! prefix in ExplicitAction
        return false;
      }
      if (HIDDEN_NODE_NAMES.includes(name)) {
        const nextLine = to < doc.length - 1 ? doc.lineAt(to + 1) : null;
        const blockTo =
          nextLine && doc.sliceString(nextLine.from, nextLine.to) === ""
            ? nextLine.to
            : to;
        specs.push({
          from,
          to: blockTo,
          block: true,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
        });
        return false;
      }
      return true;
    },
  });
  endFrontMatter(doc.length);
  endDialogue(doc.length);
  const decorations = specs.flatMap((b) => createDecorations(b, doc));
  return specs.length > 0 ? RangeSet.of(decorations, true) : Decoration.none;
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
