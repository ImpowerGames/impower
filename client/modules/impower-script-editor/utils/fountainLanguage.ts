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
import { GFM, Subscript, Superscript } from "../constants/extension";
import { parser as baseParser } from "../constants/parser";

export const tags = {
  titleKey: t.attributeName,
  titleValue: t.attributeValue,
  section: t.heading,
  sectionName: t.labelName,
  scene: t.propertyName,
  sceneNumber: t.number,
  transition: t.unit,
  assetName: t.definitionOperator,
  tagName: t.derefOperator,
  variableName: t.variableName,
  parameter: t.function(t.variableName),
  character: t.className,
  parenthetical: t.tagName,
  dialogue: t.typeName,
  dualDialogue: t.typeOperator,
  lyric: t.annotation,
  pageBreak: t.contentSeparator,
  note: t.comment,
  synopses: t.comment,
  centered: t.quote,
  underline: t.link,
  emphasis: t.emphasis,
  strong: t.strong,
  strongEmphasis: t.strong,
  sectionHeading1: t.heading1,
  sectionHeading2: t.heading2,
  sectionHeading3: t.heading3,
  sectionHeading4: t.heading4,
  sectionHeading5: t.heading5,
  sectionHeading6: t.heading6,
  conditionCheck: t.logicOperator,
  comment: t.comment,
  commentBlock: t.comment,
  escape: t.escape,
  entityName: t.character,
  link: t.link,
  image: t.link,
  orderedList: t.list,
  bulletList: t.list,
  inlineCode: t.monospace,
  codeText: t.monospace,
  url: t.url,
  paragraph: t.content,
  hardBreak: t.processingInstruction,

  sectionMark: t.heading,
  sceneMark: t.heading,
  lyricMark: t.processingInstruction,
  noteMark: t.comment,
  synopsesMark: t.comment,
  centeredMark: t.processingInstruction,
  emphasisMark: t.processingInstruction,
  underlineMark: t.processingInstruction,
  codeMark: t.processingInstruction,
  quoteMark: t.processingInstruction,
  linkMark: t.processingInstruction,
  strikethrough: t.strikethrough,
  formatting: t.processingInstruction,

  keyword: t.keyword,
  string: t.string,
  number: t.number,

  invalid: t.invalid,
};

const data = defineLanguageFacet({ block: { open: "<!--", close: "-->" } });

const commonmark = baseParser.configure({
  props: [
    styleTags({
      "Title/...": tags.titleValue,
      "TitleMark": tags.titleKey,
      "Scene/...": tags.scene,
      "SceneMark ": tags.sceneMark,
      "SceneNumber/...": tags.sceneNumber,
      "Transition/...": tags.transition,
      "Parameter": tags.parameter,
      "Character/...": tags.character,
      "Parenthetical/... CharacterParenthetical ParentheticalLine":
        tags.parenthetical,
      "CharacterDual": tags.dualDialogue,
      "Dialogue/...": tags.dialogue,
      "Lyric/...": tags.lyric,
      "LyricMark": tags.lyricMark,
      "ConditionCheck": tags.conditionCheck,
      "SectionMark PossibleSectionMark": tags.section,
      "SectionHeading1/...": tags.sectionHeading1,
      "SectionHeading2/...": tags.sectionHeading2,
      "SectionHeading3/...": tags.sectionHeading3,
      "SectionHeading4/...": tags.sectionHeading4,
      "SectionHeading5/...": tags.sectionHeading5,
      "SectionHeading6/...": tags.sectionHeading6,
      "Synopses": tags.synopses,
      "SynopsesMark": tags.synopsesMark,
      "ImageNote AudioNote DynamicTag": tags.note,
      "ImageNoteMark AudioNoteMark DynamicTagMark": tags.noteMark,
      "Centered/...": tags.centered,
      "CenteredMark": tags.centeredMark,
      "Underline/...": tags.underline,
      "UnderlineMark": tags.underlineMark,
      "Emphasis/...": tags.emphasis,
      "EmphasisMark": tags.emphasisMark,
      "StrongEmphasis/...": tags.strongEmphasis,
      "OrderedList/...": tags.orderedList,
      "PageBreak/...": tags.pageBreak,

      "Comment": tags.comment,
      "CommentBlock": tags.commentBlock,
      "Escape": tags.escape,
      "URL": tags.url,
      "Link/...": tags.link,
      "LinkMark": tags.linkMark,
      "Image/...": tags.image,
      "InlineCode": tags.inlineCode,
      "CodeText": tags.codeText,
      "CodeMark": tags.codeMark,
      "HardBreak": tags.hardBreak,
      "QuoteMark": tags.quoteMark,
      "Paragraph": tags.paragraph,
      "Strikethrough/...": tags.strikethrough,

      "VariableName AssignName": tags.variableName,
      "AssetName": tags.assetName,
      "EntityName": tags.entityName,
      "TagName": tags.tagName,
      "SectionName GoSectionName ChoiceSectionName": tags.sectionName,
      "ListMark ConditionMark CallMark AssignMark ChoiceMark VariableMark AssetMark TagMark EntityMark GoMark RepeatMark ReturnMark":
        tags.keyword,
      "String": tags.string,
      "Number": tags.number,
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
