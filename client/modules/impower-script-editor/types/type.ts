export enum Type {
  Document = 1,

  // Markdown Block
  FencedCode,
  BulletList,
  OrderedList,
  ListItem,
  SectionHeading1,
  SectionHeading2,
  SectionHeading3,
  SectionHeading4,
  SectionHeading5,
  SectionHeading6,
  HTMLBlock,
  Paragraph,
  CommentBlock,
  ProcessingInstructionBlock,

  // Fountain Block
  Synopses,
  Section,
  Title,
  Scene,
  ScenePrefix,
  SceneLocation,
  SceneTime,
  Transition,
  Character,
  CharacterName,
  Action,
  Centered,
  Go,
  Repeat,
  Return,
  Tag,
  TagName,
  TagOperator,
  TagValue,
  Asset,
  AssetName,
  AssetOperator,
  AssetValue,
  AssetImageValue,
  AssetAudioValue,
  AssetVideoValue,
  AssetTextValue,
  Variable,
  VariableName,
  VariableOperator,
  VariableValue,
  Assign,
  AssignName,
  CallName,
  AssignOperator,
  AssignValue,
  Call,
  CallSeparatorMark,
  CallValue,
  CallEntityName,
  Compare,
  Choice,
  ChoiceSectionName,
  Condition,
  ConditionCheck,
  ConditionValue,
  GoSectionName,
  GoSeparatorMark,
  GoValue,
  ReturnValue,
  PageBreak,
  PossibleCharacterName,
  PossibleCharacter,
  PossibleSection,
  PossibleLogic,

  // Markdown Inline
  Escape,
  Entity,
  HardBreak,
  Emphasis,
  StrongEmphasis,
  InlineCode,
  HTMLTag,
  Comment,
  ProcessingInstruction,
  URL,

  // Fountain Inline
  ImageNote,
  AudioNote,
  DynamicTag,
  DynamicText,
  CharacterParenthetical,
  ParentheticalLine,
  Dialogue,
  DialogueLine,
  Lyric,
  Underline,
  SceneNumber,

  // Markdown Mark
  SectionMark,
  QuoteMark,
  ListMark,
  LinkMark,
  EmphasisMark,
  CodeMark,
  CodeText,
  CodeInfo,
  LinkTitle,
  LinkLabel,

  // Fountain Mark
  ImageNoteMark,
  AudioNoteMark,
  DynamicTagMark,
  DynamicTextMark,
  SynopsesMark,
  SceneMark,
  SceneSeparatorMark,
  SceneNumberMark,
  CharacterMark,
  CharacterDual,
  ActionMark,
  TitleEntry,
  TitleMark,
  CenteredMark,
  LyricMark,
  UnderlineMark,
  TagMark,
  AssetMark,
  VariableMark,
  GoMark,
  GoOpenMark,
  GoCloseMark,
  RepeatMark,
  ReturnMark,
  AssignMark,
  ChoiceMark,
  CallMark,
  ConditionMark,
  CallOpenMark,
  CallCloseMark,
  ChoiceColonMark,
  ChoiceOpenMark,
  ChoiceCloseMark,
  ChoiceAngleMark,
  ConditionColonMark,
  PossibleSectionMark,
}
