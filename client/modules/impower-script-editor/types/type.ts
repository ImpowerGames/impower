export enum Type {
  Document = 1,

  // Markdown Block
  CodeBlock,
  FencedCode,
  HorizontalRule,
  BulletList,
  OrderedList,
  ListItem,
  ATXHeading1,
  ATXHeading2,
  ATXHeading3,
  ATXHeading4,
  ATXHeading5,
  ATXHeading6,
  SetextHeading1,
  SetextHeading2,
  HTMLBlock,
  LinkReference,
  Paragraph,
  CommentBlock,
  ProcessingInstructionBlock,

  // Markdown Inline
  Escape,
  Entity,
  HardBreak,
  Emphasis,
  StrongEmphasis,
  Link,
  Image,
  InlineCode,
  HTMLTag,
  Comment,
  ProcessingInstruction,
  URL,

  // Markdown Mark
  HeaderMark,
  QuoteMark,
  ListMark,
  LinkMark,
  EmphasisMark,
  CodeMark,
  CodeText,
  CodeInfo,
  LinkTitle,
  LinkLabel,

  // --------------

  // Fountain Block
  Title,
  SceneHeading,
  Transition,
  Character,
  Dialogue,
  DualDialogue,
  Lyric,
  Action,

  // Fountain Inline
  Parenthetical,
  Underline,
  Centered,

  // Fountain Mark
  SceneHeadingMark,
  CharacterMark,
  DualDialogueMark,
  ActionMark,
  TransitionMark,
  TitleMark,
  CenteredMark,
  LyricMark,
  UnderlineMark,
}
