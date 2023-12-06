import { SparkTokenTag } from "../types/SparkTokenTag";
import { SparkdownNodeName } from "../types/SparkdownNodeName";

const SPARK_TOKEN_TAGS: {
  [t in SparkdownNodeName]?: SparkTokenTag;
} = {
  Comment: "comment",
  CommentContent: "comment_content",

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

  TypeIdentifier: "type_name",
  DeclarationName: "declaration_name",
  AccessIdentifier: "access_identifier",
  AccessIdentifierPart: "access_identifier_part",
  VariableName: "variable_name",
  PropertyName: "property_name",
  FunctionName: "function_name",
  ValueText: "value_text",
  String: "string",

  FlowBreak: "flow_break",

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
  AssignAccessIdentifier: "assign_access_identifier",
  AssignOperator: "assign_operator",

  Delete: "delete",
  DeleteAccessIdentifier: "delete_access_identifier",

  Jump: "jump",
  JumpToSection: "jump_to_section",
  Choice: "choice",
  Transition: "transition",
  Scene: "scene",

  Image: "image",
  Audio: "audio",
  InlineImage: "image",
  InlineAudio: "audio",
  AssetTarget: "asset_target",
  AssetNames: "asset_names",
  AssetArgs: "asset_args",

  ExplicitAction: "action",
  ImplicitAction: "action",
  ExplicitAction_begin: "action_start",
  ExplicitAction_end: "action_end",
  ImplicitAction_begin: "action_start",
  ImplicitAction_end: "action_end",
  ActionBox: "action_box",
  Dialogue: "dialogue",
  Dialogue_begin: "dialogue_start",
  Dialogue_end: "dialogue_end",
  DialogueBox: "dialogue_box",
  DialogueCharacterName: "dialogue_character_name",
  DialogueCharacterParenthetical: "dialogue_character_parenthetical",
  DialogueCharacterSimultaneous: "dialogue_character_simultaneous",
  DialogueLineParentheticalContent: "dialogue_line_parenthetical",
  DisplayText_c1: "display_text_prerequisite_value",
  DisplayText_c2: "display_text_prerequisite_operator",
  DisplayText_c5: "display_text_target",
  DisplayText_c7: "display_text_content",
  DisplayString: "text",

  Newline: "newline",
  Indent: "indent",
  Whitespace: "whitespace",
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
