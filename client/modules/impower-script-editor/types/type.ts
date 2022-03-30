export enum Type {
  Document = 1,

  // Markdown Block
  FencedCode,
  BulletList,
  OrderedList,
  ListItem,
  HTMLBlock,
  Paragraph,
  CommentBlock,
  ProcessingInstructionBlock,

  // Spark Block
  Synopses,
  Section,
  SectionReturnType,
  SectionName,
  SectionOpenMark,
  SectionSeparatorMark,
  SectionParameter,
  SectionVariableName,
  SectionParameterName,
  SectionParameterOperator,
  SectionParameterValue,
  SectionCloseMark,
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
  Interpolation,
  InterpolationVariableName,

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

  // Spark Inline
  ImageNote,
  AudioNote,
  DynamicTag,
  CharacterParenthetical,
  ParentheticalLine,
  Dialogue,
  DialogueLine,
  Lyric,
  Underline,
  SceneNumber,
  Spaces,
  Pause,

  // Keywords
  Number,
  String,
  Boolean,

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

  // Spark Mark
  ImageNoteMark,
  AudioNoteMark,
  DynamicTagMark,
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
  ChoiceGoMark,
  ConditionColonMark,
  PossibleSectionMark,
  InterpolationOpenMark,
  InterpolationCloseMark,
}
