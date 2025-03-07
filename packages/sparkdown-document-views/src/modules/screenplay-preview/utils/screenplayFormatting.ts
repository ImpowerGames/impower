import { HighlightStyle, syntaxTree } from "@codemirror/language";
import type { EditorState, Text } from "@codemirror/state";
import { Extension, Range, RangeSet, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { SyntaxNodeRef } from "@lezer/common";
import { getStyleTags, highlightTree, tags } from "@lezer/highlight";
import { PAGE_POSITIONS } from "../../../../../sparkdown-screenplay/src/constants/PAGE_POSITIONS";
import GRAMMAR from "../../../../../sparkdown/language/sparkdown.language-grammar.json";
import { TextmateLanguageSupport } from "../../../cm-textmate/classes/TextmateLanguageSupport";
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

const LANGUAGE_SUPPORT = new TextmateLanguageSupport(LANGUAGE_NAME, GRAMMAR);

const INLINE_HIDDEN_STYLE = {
  display: "inline-block",
  visibility: "hidden",
  width: "0",
  height: "0",
};

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
  tags.special(tags.content),
  tags.comment,
  tags.blockComment,
  tags.docComment,
  tags.macroName,
  tags.meta,
];

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
    visibility: "hidden",
    height: "0",
  },

  ...INLINE_HIDDEN_TAGS.map((tag) => ({ tag, ...INLINE_HIDDEN_STYLE })),

  {
    tag: tags.contentSeparator,
    display: "block",
    color: "transparent",
    borderBottom: "1px solid #00000033",
  },
]);

export const debugDecorations = (
  decorations: RangeSet<Decoration>,
  state: EditorState
) => {
  const iter = decorations.iter(0);
  while (iter.value) {
    console.log(
      iter.from,
      iter.to,
      JSON.stringify(state.sliceDoc(iter.from, iter.to)),
      iter.value
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
      }).range(doc.line(i).from)
    );
  }
  return lineDecorations;
};

const createDecorations = (
  doc: Text,
  spec: DecorationSpec
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
        }).range(spec.from, spec.to),
      ];
    } else {
      const blocks = spec.blocks[0];
      if (blocks) {
        return blocks.map((b) =>
          Decoration.line({
            attributes: b.attributes,
          }).range(doc.lineAt(b.from).from)
        );
      }
    }
  }
  if (spec.type === "replace") {
    return [Decoration.replace({}).range(spec.from, spec.to)];
  }
  return [];
};

const decorate = (state: EditorState, from: number = 0, to?: number) => {
  let prevDialogueSpec: DialogueSpec | undefined = undefined;
  const decorations: Range<Decoration>[] = [];
  const doc = state.doc;

  const isCentered = (nodeRef: SyntaxNodeRef) => {
    const name = nodeRef.name as SparkdownNodeName;
    if (name === "Centered") {
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
      })
    );
  };

  const isBlockHidden = (nodeRef: SyntaxNodeRef) => {
    const name = nodeRef.name as SparkdownNodeName;
    if (nodeRef.node.parent?.name === "sparkdown") {
      // This is a top-level node
      return (
        name !== "FrontMatter" &&
        name !== "Knot" && // TODO: hide knot if config doesn't print knot
        //name !== "Stitch" && // TODO: Only hide stitch if config doesn't print stitch
        name !== "Transition" &&
        name !== "Scene" &&
        name !== "Action" &&
        name !== "BlockDialogue" &&
        name !== "InlineDialogue" &&
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
      })
    );
    isBlankLineFrom = undefined;
    if (hiddenNodeEndsWithNewline) {
      processNewline(nodeRef.to);
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
        })
      );
    }
  };

  const processNewline = (to: number) => {
    if (isBlankLineFrom != null) {
      decorations.push(
        ...createDecorations(doc, {
          type: "collapse",
          from: isBlankLineFrom,
          to: to - 1,
          separator: true,
        })
      );
    }
    isBlankLineFrom = to;
  };

  const prevChar = doc.sliceString(from - 1, from);

  let isBlankLineFrom = prevChar === "" ? 0 : undefined;
  let inDialogue = false;
  let inDualDialogue = false;
  let dialoguePosition = 0;
  let dialogueContent: MarkupContent[] = [];
  let frontMatterPositionContent: Record<string, MarkupContent[]> = {};
  let frontMatterFieldCaptureBlocks: MarkupContent[] = [];
  let frontMatterKeyword = "";

  const tree = syntaxTree(state);

  tree.iterate({
    from,
    to,
    enter: (nodeRef) => {
      const name = nodeRef.name as SparkdownNodeName;
      const from = nodeRef.from;
      const to = nodeRef.to;
      if (name === "Newline") {
        processNewline(nodeRef.to);
      } else if (to > from && name !== "sparkdown" && name !== "Whitespace") {
        isBlankLineFrom = undefined;
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
      } else if (name === "DialogueCharacter") {
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
      } else if (name === "Knot") {
        decorations.push(
          ...createDecorations(doc, {
            type: "page_break",
            from,
            to,
          })
        );
        return false;
      } else if (name === "Indent") {
        hideInlineRange(nodeRef);
        return false;
      } else if (isCentered(nodeRef)) {
        centerRange(nodeRef);
        return false;
      } else if (isBlockHidden(nodeRef)) {
        hideBlockRange(nodeRef);
        return false;
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
        // Add FrontMatter Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          })
        );
        decorations.push(
          ...createDecorations(doc, {
            type: "title_page",
            from,
            to,
            language: LANGUAGE_SUPPORT.language,
            highlighter: LANGUAGE_HIGHLIGHTS,
            ...frontMatterPositionContent,
          })
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
            frontMatterKeyword.toLowerCase() as keyof typeof PAGE_POSITIONS
          ];
        if (position) {
          frontMatterPositionContent[position] ??= [];
          frontMatterPositionContent[position]!.push(
            ...frontMatterFieldCaptureBlocks
          );
        }
      } else if (name === "Transition") {
        // Add Transition Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          })
        );
      } else if (name === "Scene") {
        // Add Scene Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          })
        );
      } else if (name === "Action") {
        // Add Action Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          })
        );
      } else if (name === "Choice") {
        // Add Choice Spec
        decorations.push(
          ...createDecorations(doc, {
            type: "reveal",
            from,
            to,
          })
        );
      } else if (name === "BlockDialogue" || name === "InlineDialogue") {
        if (inDualDialogue) {
          const isOdd = dialoguePosition % 2 !== 0;
          if (isOdd) {
            // left (odd position)
            const spec: DialogueSpec = {
              type: "dialogue",
              from,
              to: to - 1,
              language: LANGUAGE_SUPPORT.language,
              highlighter: LANGUAGE_HIGHLIGHTS,
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
      decorations.push(Decoration.mark({ class: style }).range(from, to));
    },
    from,
    to
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
    const oldTree = syntaxTree(transaction.startState);
    const newTree = syntaxTree(transaction.state);
    // console.log("FULL TREE");
    // console.log(printTree(newTree, transaction.state.doc.toString()));
    if (oldTree != newTree) {
      const cachedCompiler = newTree.prop(cachedCompilerProp);
      const reparsedFrom = cachedCompiler?.reparsedFrom;
      const reparsedTo = cachedCompiler?.reparsedTo
        ? cachedCompiler.reparsedTo - 1
        : undefined;
      if (
        reparsedFrom == null ||
        (newTree.length !== oldTree.length && !transaction.docChanged)
      ) {
        // Remake all decorations from scratch
        const ranges = decorate(transaction.state);
        decorations =
          ranges.length > 0 ? RangeSet.of(ranges, true) : Decoration.none;
        return decorations;
      }
      if (reparsedTo == null) {
        // Only rebuild decorations after reparsedFrom
        const add = decorate(transaction.state, reparsedFrom);
        decorations = decorations.map(transaction.changes);
        decorations = decorations.update({
          filter: (_from, to) => to < reparsedFrom,
          add,
          sort: true,
        });
        return decorations;
      }
      // Only rebuild decorations between reparsedFrom and reparsedTo
      const add = decorate(transaction.state, reparsedFrom, reparsedTo);
      decorations = decorations.map(transaction.changes);
      decorations = decorations.update({
        filter: (from, to) => to < reparsedFrom || from > reparsedTo,
        add,
        sort: true,
      });
    }
    return decorations;
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
  ];
};

export default screenplayFormatting;
