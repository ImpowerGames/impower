import { SparkTokenTag } from "../types/SparkTokenTag";
import { SparkdownNodeName } from "../types/SparkdownNodeName";

const SPARK_TOKEN_TAGS: {
  [t in SparkdownNodeName]?: SparkTokenTag;
} = {
  Comment: "comment",
  LineCommentContent: "comment_content",
  BlockCommentContent: "comment_content",

  FrontMatter_begin: "front_matter_start",
  FrontMatter_end: "front_matter_end",
  FrontMatterField: "front_matter_field",
  FrontMatterFieldKeyword: "front_matter_field_keyword",
  FrontMatterArrayItem: "front_matter_field_item",
  FrontMatterString: "front_matter_field_string",

  Chunk: "chunk",
  ChunkName: "chunk_name",
  Section: "section",
  SectionLevel: "section_level",
  SectionName: "section_name",
  Checkpoint: "checkpoint",
  CheckpointName: "checkpoint_name",

  TypeName: "type_name",
  DeclarationType: "declaration_type",
  DeclarationName: "declaration_name",
  DeclarationAssignOperator: "declaration_assign_operator",
  DeclarationProperty: "declaration_property",
  TargetAccessPath: "target_access_path",
  AccessPath: "access_path",
  VariableName: "variable_name",
  PropertyName: "property_name",
  FunctionName: "function_name",
  ValueText: "value_text",
  String: "string",

  Import: "import",

  Store: "store",

  Define: "define",

  StructField: "struct_field",
  StructMapItem: "struct_map_item",
  StructScalarItem: "struct_scalar_item",
  StructMapProperty: "struct_map_property",
  StructMapProperty_begin: "struct_map_property_start",
  StructScalarProperty: "struct_scalar_property",
  StructScalarProperty_begin: "struct_scalar_property_start",
  StructBlankProperty: "struct_blank_property",

  DefineFunction: "function",

  Break: "break",
  Continue: "continue",
  Return: "return",
  If: "if",
  Elseif: "elseif",
  Else: "else",
  If_end: "end",
  While: "while",
  Until: "until",
  For: "for",
  Call: "call",

  Assign: "assign",

  Delete: "delete",

  Jump: "jump",
  JumpToSection: "jump_to_section",
  Choice: "choice",
  ChoiceOperator: "choice_operator",
  Transition: "transition",
  Scene: "scene",

  ImageTag: "image_tag",
  AudioTag: "audio_tag",
  CommandTag: "command_tag",
  InlineImageTag: "image_tag",
  InlineAudioTag: "audio_tag",
  InlineCommandTag: "command_tag",
  AssetTagControl: "asset_tag_control",
  AssetTagTarget: "asset_tag_target",
  AssetTagTargetSeparator: "asset_tag_target_separator",
  AssetTagNames: "asset_tag_names",
  AssetTagArguments: "asset_tag_arguments",
  AssetTagArgument: "asset_tag_argument",
  CommandTagControl: "command_tag_control",

  ExplicitAction: "action",
  ImplicitAction: "action",
  ActionBox: "action_box",
  Dialogue: "dialogue",
  DialogueBox: "dialogue_box",
  DialogueCharacterName: "dialogue_character_name",
  DialogueCharacterParenthetical: "dialogue_character_parenthetical",
  DialogueCharacterSimultaneous: "dialogue_character_simultaneous",
  ParentheticalContent: "parenthetical",
  Spec: "spec",
  DisplayText: "display_text",
  DisplayString: "text",
  Escape: "text",
  TargetName: "target_name",

  Newline: "newline",
  Indent: "indent",
  Whitespace: "whitespace",

  Color: "color",

  PunctuationSemicolon: "punctuation_semicolon",
  PunctuationComma: "punctuation_comma",
  PunctuationAccessor: "punctuation_accessor",
  PunctuationParenOpen: "punctuation_paren_open",
  PunctuationParenClose: "punctuation_paren_close",

  Operator: "operator",
  Literal: "literal",

  IllegalPropertyDeclaration: "illegal",
  IllegalExpression: "illegal",
  IllegalChar: "illegal",
  Unknown: "unknown",
};

export default SPARK_TOKEN_TAGS;
