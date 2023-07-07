import {
  HighlightStyle,
  ensureSyntaxTree,
  syntaxHighlighting,
} from "@codemirror/language";
import type { EditorState, Text } from "@codemirror/state";
import { Extension, RangeSet, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import grammarDefinition from "../../../../language/sparkdown.language-grammar.json";
import TextmateLanguageSupport from "../../../cm-textmate/classes/TextmateLanguageSupport";
import CenteredWidget from "../classes/widgets/CenteredWidget";
import DialogueWidget, {
  DialogueSpec,
} from "../classes/widgets/DialogueWidget";
import PageBreakWidget from "../classes/widgets/PageBreakWidget";
import SceneWidget from "../classes/widgets/SceneWidget";
import TitlePageWidget from "../classes/widgets/TitlePageWidget";
import TransitionWidget from "../classes/widgets/TransitionWidget";
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
]);

const HIDDEN_NODE_NAMES = [
  "Comment",
  "Image",
  "Audio",
  "Synopsis",
  "Struct",
  "Variable",
  "Jump",
  "Condition",
  "Logic",
  "Import",
  "Return",
  "Section",
];

const VISIBLE_NODE_NAMES = {
  FrontMatter: "FrontMatter",
  PageBreak: "PageBreak",
  Centered: "Centered",
  Centered_content: "Centered-c4",
  CenteredAngle: "CenteredAngle",
  CenteredAngle_content: "CenteredAngle-c4",
  Choice: "Choice",
  Scene: "Scene",
  Transition: "Transition",
  Dialogue: "Dialogue",
  Dialogue_begin_character: "Dialogue_begin-c2",
  Dialogue_begin_parenthetical: "Dialogue_begin-c4",
  Dialogue_begin_dual: "Dialogue_begin-c6",
  Parenthetical: "Parenthetical",
  InlineString: "InlineString",
  Action: "Action",
} as const;

const FRONTMATTER_POSITIONS = {
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
const FRONTMATTER_POSITION_ENTRIES = Object.entries(FRONTMATTER_POSITIONS);

const createReplaceDecoration = (spec: ReplaceSpec) => {
  return Decoration.replace({
    widget: spec.widget ? new spec.widget(spec) : undefined,
    block: spec.block,
  });
};

const getContentBlock = (
  doc: Text,
  from: number,
  to: number,
  end = "\n\n"
): string => {
  const str = doc.sliceString(from, to);
  const emptyLineIndex = str.indexOf(end);
  if (emptyLineIndex >= 0) {
    return str.slice(0, emptyLineIndex);
  }
  return str;
};

const decorate = (state: EditorState) => {
  let prevDialogueSpec: DialogueSpec | undefined = undefined;
  const specs: ReplaceSpec[] = [];
  const doc = state.doc;
  ensureSyntaxTree(state, doc.length - 1, 5000)?.iterate({
    enter: (nodeRef) => {
      const type = nodeRef.type;
      const from = nodeRef.from;
      const to = nodeRef.to;
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
      } else if (type.name === VISIBLE_NODE_NAMES.FrontMatter) {
        const str = doc.sliceString(from, to);
        const positions: Record<string, MarkupBlock[]> = {};
        const tree = nodeRef.node.toTree() || nodeRef.node.toTree();
        tree.iterate({
          enter: (childNodeRef) => {
            FRONTMATTER_POSITION_ENTRIES.forEach(([k, v]) => {
              if (childNodeRef.type.name === k) {
                let value = "";
                const childStr = str.slice(childNodeRef.from, childNodeRef.to);
                const childTree =
                  childNodeRef.tree || childNodeRef.node.toTree();
                childTree.iterate({
                  enter: (captureNodeRef) => {
                    if (
                      captureNodeRef.type.name ===
                      VISIBLE_NODE_NAMES.InlineString
                    ) {
                      value +=
                        childStr
                          .slice(captureNodeRef.from, captureNodeRef.to)
                          .trim() + "\n";
                    }
                  },
                });
                positions[v] ??= [];
                positions[v]!.push({ value, markdown: true, margin: "1em 0" });
              }
            });
          },
        });
        specs.push({
          from,
          to,
          block: true,
          widget: TitlePageWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          ...positions,
        });
      } else if (type.name === VISIBLE_NODE_NAMES.PageBreak) {
        specs.push({
          from,
          to,
          widget: PageBreakWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          block: true,
        });
      } else if (type.name === VISIBLE_NODE_NAMES.Centered) {
        const str = getContentBlock(doc, from, to);
        const content: MarkupBlock[] = [];
        const tree = nodeRef.node.toTree() || nodeRef.node.toTree();
        tree.iterate({
          enter: (childNodeRef) => {
            if (
              childNodeRef.type.name === VISIBLE_NODE_NAMES.Centered_content
            ) {
              const value = str.slice(childNodeRef.from, childNodeRef.to);
              content.push({ value, markdown: true });
            }
          },
        });
        specs.push({
          from,
          to,
          widget: CenteredWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          block: true,
          content,
        });
      } else if (type.name === VISIBLE_NODE_NAMES.CenteredAngle) {
        const str = getContentBlock(doc, from, to);
        const content: MarkupBlock[] = [];
        const tree = nodeRef.node.toTree() || nodeRef.node.toTree();
        tree.iterate({
          enter: (childNodeRef) => {
            if (
              childNodeRef.type.name ===
              VISIBLE_NODE_NAMES.CenteredAngle_content
            ) {
              const value = str.slice(childNodeRef.from, childNodeRef.to);
              content.push({ value, markdown: true });
            }
          },
        });
        specs.push({
          from,
          to,
          widget: CenteredWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          block: true,
          content,
        });
      } else if (type.name === VISIBLE_NODE_NAMES.Scene) {
        const str = getContentBlock(doc, from, to);
        const content = [{ value: str.startsWith(".") ? str.slice(1) : str }];
        specs.push({
          from,
          to,
          widget: SceneWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          block: true,
          content,
        });
      } else if (type.name === VISIBLE_NODE_NAMES.Transition) {
        const str = getContentBlock(doc, from, to);
        const content = [{ value: str }];
        specs.push({
          from,
          to,
          widget: TransitionWidget,
          language: LANGUAGE_SUPPORT.language,
          highlighter: LANGUAGE_HIGHLIGHTS,
          block: true,
          content,
        });
      } else if (type.name === VISIBLE_NODE_NAMES.Dialogue) {
        const str = getContentBlock(doc, from, to);
        const content: MarkupBlock[] = [];
        let isDual = false;
        const tree = nodeRef.node.toTree() || nodeRef.node.toTree();
        tree.iterate({
          enter: (childNodeRef) => {
            if (
              childNodeRef.type.name ===
              VISIBLE_NODE_NAMES.Dialogue_begin_character
            ) {
              const value = str
                .slice(childNodeRef.from, childNodeRef.to)
                .trim();
              content.push({ value, margin: "0 0 0 23%" });
            } else if (
              childNodeRef.type.name ===
              VISIBLE_NODE_NAMES.Dialogue_begin_parenthetical
            ) {
              const value = str
                .slice(childNodeRef.from, childNodeRef.to)
                .trim();
              const characterLine = content[0];
              if (characterLine) {
                characterLine.value += " " + value;
              }
            } else if (
              childNodeRef.type.name === VISIBLE_NODE_NAMES.Parenthetical
            ) {
              const value = str
                .slice(childNodeRef.from, childNodeRef.to)
                .trim();
              content.push({ value, margin: "0 0 0 11%" });
            } else if (
              childNodeRef.type.name === VISIBLE_NODE_NAMES.InlineString
            ) {
              const value = str
                .slice(childNodeRef.from, childNodeRef.to)
                .trim();
              content.push({ value, markdown: true });
            } else if (
              childNodeRef.type.name === VISIBLE_NODE_NAMES.Dialogue_begin_dual
            ) {
              const value = str
                .slice(childNodeRef.from, childNodeRef.to)
                .trim();
              if (value) {
                isDual = true;
              }
            }
          },
        });
        if (isDual) {
          if (prevDialogueSpec) {
            prevDialogueSpec.to = to - 1;
            prevDialogueSpec.left = prevDialogueSpec.content;
            prevDialogueSpec.right = content;
            prevDialogueSpec.content = undefined;
          }
        } else {
          const spec: ReplaceSpec = {
            from,
            to: to - 1,
            widget: DialogueWidget,
            language: LANGUAGE_SUPPORT.language,
            highlighter: LANGUAGE_HIGHLIGHTS,
            block: true,
            content,
          };
          specs.push(spec);
          prevDialogueSpec = spec;
        }
      }
    },
  });

  return specs.length > 0
    ? RangeSet.of(
        specs.map((b) => createReplaceDecoration(b).range(b.from, b.to))
      )
    : Decoration.none;
};

const replaceDecorations = StateField.define<DecorationSet>({
  create(state) {
    return decorate(state);
  },
  update(images, transaction) {
    if (transaction.docChanged) {
      return decorate(transaction.state);
    }
    return images.map(transaction.changes);
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
