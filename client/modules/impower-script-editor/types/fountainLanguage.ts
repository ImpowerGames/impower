/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { styleTags, tags as t } from "@codemirror/highlight";
import {
  defineLanguageFacet,
  foldNodeProp,
  indentNodeProp,
  Language,
  languageDataProp,
  LanguageDescription,
  ParseContext,
} from "@codemirror/language";
import { MarkdownParser } from "../classes/MarkdownParser";
import { GFM, Subscript, Superscript } from "./extension";
import { parser as baseParser } from "./parser";

const data = defineLanguageFacet({ block: { open: "<!--", close: "-->" } });

const commonmark = baseParser.configure({
  props: [
    styleTags({
      "Title/...": t.attributeValue,
      "TitleMark/...": t.attributeName,
      "Character/...": t.className,
      "Parenthetical/...": t.tagName,
      "Dialogue/...": t.typeName,
      "DualDialogueMark/...": t.typeOperator,
      "SceneHeading/...": t.propertyName,
      "SceneNumber/...": t.number,
      "Centered/...": t.quote,
      "Transition/...": t.controlKeyword,
      "Lyric/...": t.annotation,
      "Underline/...": t.link,
      "HorizontalRule": t.contentSeparator,
      "ATXHeading1/... SetextHeading1/...": t.heading1,
      "ATXHeading2/... SetextHeading2/...": t.heading2,
      "ATXHeading3/...": t.heading3,
      "ATXHeading4/...": t.heading4,
      "ATXHeading5/...": t.heading5,
      "ATXHeading6/...": t.heading6,
      "Comment CommentBlock Synopses Note": t.comment,
      "SynopsesMark NoteMark": t.docComment,
      "Escape": t.escape,
      "Entity": t.character,
      "Emphasis/...": t.emphasis,
      "StrongEmphasis/...": t.strong,
      "Link/... Image/...": t.link,
      "OrderedList/... BulletList/...": t.list,
      "InlineCode CodeText": t.monospace,
      "URL": t.url,
      "HardBreak QuoteMark ListMark LinkMark EmphasisMark UnderlineMark CodeMark LyricMark CenteredMark":
        t.processingInstruction,
      "TransitionMark": t.controlOperator,
      "HeaderMark ": t.heading,
      "SceneHeadingMark ": t.heading,
      "CodeInfo LinkLabel": t.labelName,
      "LinkTitle": t.string,
      "Paragraph": t.content,
    }),
    foldNodeProp.add((type) => {
      if (!type.is("Section") && !type.is("Title")) {
        return undefined;
      }
      return (tree, state) => ({
        from: state.doc.lineAt(tree.from).to,
        to: tree.to,
      });
    }),
    indentNodeProp.add({
      Document: () => null,
    }),
    languageDataProp.add({
      Document: data,
    }),
  ],
});

export function mkLang(parser: MarkdownParser): Language {
  return new Language(
    data,
    parser,
    parser.nodeSet.types.find((t) => t.name === "Document")
  );
}

/// Language support for strict CommonMark.
export const commonmarkLanguage = mkLang(commonmark);

const extended = commonmark.configure([
  GFM,
  Subscript,
  Superscript,
  {
    props: [
      styleTags({
        "TableDelimiter SubscriptMark SuperscriptMark StrikethroughMark":
          t.processingInstruction,
        "TableHeader/...": t.heading,
        "Strikethrough/...": t.strikethrough,
        "TaskMarker": t.atom,
        "Task": t.list,
        "Emoji": t.character,
        "Subscript Superscript": t.special(t.content),
        "TableCell": t.content,
      }),
    ],
  },
]);

/// Language support for [GFM](https://github.github.com/gfm/) plus
/// subscript, superscript, and emoji syntax.
export const fountainLanguage = mkLang(extended);

export function getCodeParser(
  languages: readonly LanguageDescription[],
  defaultLanguage?: Language
) {
  return (info: string) => {
    const found =
      info && LanguageDescription.matchLanguageName(languages, info, true);
    if (!found) return defaultLanguage ? defaultLanguage.parser : null;
    if (found.support) return found.support.language.parser;
    return ParseContext.getSkippingParser(found.load());
  };
}
