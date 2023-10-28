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

  TypeIdentifier: "type_name",
  IdentifierPath: "identifier_path",
  AssignOperator: "assign_operator",
  ValueText: "value_text",

  FlowBreak: "flow_break",

  Import: "import",

  DefineStruct: "struct",
  StructMapItem: "struct_map_item",
  StructScalarItem: "struct_scalar_item",
  StructMapProperty: "struct_map_property",
  StructScalarProperty: "struct_scalar_property",

  DefineFunction: "function",

  Break: "break",
  Continue: "continue",
  Return: "return",
  Delete: "delete",
  If: "if",
  Elseif: "elseif",
  Else: "else",
  While: "while",
  Until: "until",
  For: "for",
  Call: "call",
  Assign: "assign",

  Jump: "jump",
  JumpToSection: "jump_to_section",
  Choice: "choice",
  ChoiceContent: "choice_content",
  Transition: "transition",
  TransitionContent: "transition_content",
  Scene: "scene",
  SceneContent: "scene_content",
  Centered: "centered",
  CenteredContent: "centered_content",

  ImageContent: "image",
  AudioContent: "audio",

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
  BoxLineContinue: "box_line_continue",
  BoxLineComplete: "box_line_complete",
  DisplayText_c1: "display_text_prerequisite_value",
  DisplayText_c2: "display_text_prerequisite_operator",
  DisplayText_c3: "display_text_content",

  Unknown: "unknown",
};

export default SPARK_TOKEN_TAGS;