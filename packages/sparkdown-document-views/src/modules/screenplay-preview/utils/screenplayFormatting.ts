import {
  DocInput,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import type { EditorState, Text } from "@codemirror/state";
import { Extension, Range, RangeSet, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import grammarDefinition from "../../../../language/sparkdown.language-grammar.json";
import TextmateLanguageSupport from "../../../cm-textmate/classes/TextmateLanguageSupport";
import DialogueWidget, {
  DialogueSpec,
} from "../classes/widgets/DialogueWidget";
import TitlePageWidget from "../classes/widgets/TitlePageWidget";
import { MarkupBlock } from "../types/MarkupBlock";
import { ReplaceSpec } from "../types/ReplaceSpec";

const LANGUAGE_SUPPORT = new TextmateLanguageSupport(
  "sparkdown",
  grammarDefinition
);

const LANGUAGE_HIGHLIGHTS = HighlightStyle.define([
  { tag: tags.quote, fontStyle: "italic" },
  { tag: tags.emphasis, fontStyle: "italic" },
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
  {
    tag: tags.contentSeparator,
    display: "block",
    color: "transparent",
    borderBottom: "1px solid #00000033",
  },
  { tag: tags.regexp, fontWeight: "bold" },
  { tag: tags.labelName, display: "block", textAlign: "right" },

  { tag: tags.comment, display: "none" },
  { tag: tags.blockComment, display: "none" },
  { tag: tags.docComment, display: "none" },

  { tag: tags.macroName, display: "none" },
]);

const HIDDEN_NODE_NAMES = [
  "Comment",
  "Image",
  "Audio",
  "Label",
  "Struct",
  "Variable",
  "Jump",
  "Condition",
  "Logic",
  "Import",
  "Load",
  "Return",
  "Section",
];

const NODE_NAMES = {
  FrontMatter: "FrontMatter",
  FrontMatter_begin: "FrontMatter_begin",
  FrontMatter_end: "FrontMatter_end",
  Dialogue: "Dialogue",
  Dialogue_begin: "Dialogue_begin",
  Dialogue_end: "Dialogue_end",
  Dialogue_begin_character: "Dialogue_begin-c2",
  Dialogue_begin_parenthetical: "Dialogue_begin-c4",
  Dialogue_begin_dual: "Dialogue_begin-c6",
  Parenthetical: "Parenthetical",
  InlineString: "InlineString",
  Action: "Action",
  Centered: "Centered",
  CenteredAngle: "CenteredAngle",
  PageBreak: "PageBreak",
  Transition: "Transition",
  Scene: "Scene",
  Newline: "newline",
} as const;

const FRONTMATTER_POSITIONS: Record<string, string> = {
  TitleEntry: "cc",
  CreditEntry: "cc",
  AuthorEntry: "cc",
  SourceEntry: "cc",
  NotesEntry: "bl",
  DateEntry: "br",
  ContactEntry: "br",
  RevisionEntry: "br",
  CopyrightEntry: "br",
  TLEntry: "tl",
  TCEntry: "tc",
  TREntry: "tr",
  CCEntry: "cc",
  BLEntry: "bl",
  BREntry: "br",
};
const FRONTMATTER_ENTRY_NODE_NAMES = Object.keys(FRONTMATTER_POSITIONS);

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

const getDialogueLineStyle = (paddingLeft: string = "0") => {
  return `margin: 0 auto; width: 68%; padding: 0 0 0 ${paddingLeft};`;
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
          prevDialogueSpec.to = to - 1;
          prevDialogueSpec.left = prevDialogueSpec.content;
          prevDialogueSpec.right = dialogueContent;
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
      if (type.name === NODE_NAMES.FrontMatter) {
        inFrontMatter = true;
        frontMatterFrom = from;
        frontMatterPositionContent = {};
        return true;
      }
      if (FRONTMATTER_ENTRY_NODE_NAMES.includes(type.name)) {
        const captureBlocks: MarkupBlock[] = [];
        const childTree = nodeRef.node.tree || nodeRef.node.toTree();
        childTree.iterate({
          enter: (captureNodeRef) => {
            if (captureNodeRef.type.name === NODE_NAMES.InlineString) {
              const captureLength = captureNodeRef.to - captureNodeRef.from;
              const captureFrom = from + captureNodeRef.from;
              const captureTo = captureFrom + captureLength;
              const value = doc.sliceString(captureFrom, captureTo).trim();
              captureBlocks.push({
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
        const position = FRONTMATTER_POSITIONS[type.name];
        if (position) {
          frontMatterPositionContent[position] ??= [];
          frontMatterPositionContent[position]!.push(...captureBlocks);
        }
        return false;
      }
      if (type.name === NODE_NAMES.FrontMatter_end) {
        endFrontMatter(to);
        return false;
      }
      if (type.name === NODE_NAMES.Dialogue) {
        inDialogue = true;
        inDualDialogue = false;
        dialogueFrom = from;
        dialogueContent = [];
        return true;
      }
      if (type.name === NODE_NAMES.Dialogue_end) {
        endDialogue(to);
        return false;
      }
      if (type.name === NODE_NAMES.Dialogue_begin_character) {
        const value = doc.sliceString(from, to).trim();
        dialogueContent.push({
          from,
          to,
          value,
          attributes: {
            style: getDialogueLineStyle("23%"),
          },
        });
        return false;
      }
      if (type.name === NODE_NAMES.Dialogue_begin_parenthetical) {
        const value = doc.sliceString(from, to).trim();
        const firstDialogueBlockLine = dialogueContent[0];
        if (firstDialogueBlockLine) {
          firstDialogueBlockLine.value += " " + value;
          firstDialogueBlockLine.to = to;
        }
        return false;
      }
      if (type.name === NODE_NAMES.Dialogue_begin_dual) {
        const value = doc.sliceString(from, to).trim();
        if (value) {
          inDualDialogue = true;
        }
        return false;
      }
      if (type.name === NODE_NAMES.Parenthetical) {
        const value = doc.sliceString(from, to).trim();
        dialogueContent.push({
          from,
          to,
          value,
          attributes: {
            style: getDialogueLineStyle("11%"),
          },
        });
        return false;
      }
      if (type.name === NODE_NAMES.InlineString && inDialogue) {
        const value = doc.sliceString(from, to).trim();
        dialogueContent.push({
          from,
          to,
          value,
          markdown: true,
          attributes: {
            style: getDialogueLineStyle(),
          },
        });
        return false;
      }
      if (type.name === NODE_NAMES.Action) {
        return false;
      }
      if (
        type.name === NODE_NAMES.Centered ||
        type.name === NODE_NAMES.CenteredAngle
      ) {
        specs.push({
          from,
          to,
          content: [
            {
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
      if (type.name === NODE_NAMES.PageBreak) {
        return false;
      }
      if (type.name === NODE_NAMES.Transition) {
        return false;
      }
      if (type.name === NODE_NAMES.Scene) {
        return false;
      }
      if (HIDDEN_NODE_NAMES.includes(type.name)) {
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
  return specs.length > 0 ? RangeSet.of(decorations) : Decoration.none;
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
