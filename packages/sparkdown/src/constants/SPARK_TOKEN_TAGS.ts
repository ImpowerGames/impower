import { SparkTokenTag } from "../types/SparkTokenTag";
import { SparkdownNodeName } from "../types/SparkdownNodeName";

const SPARK_TOKEN_TAGS: Partial<Record<SparkdownNodeName, SparkTokenTag>> = {
  Comment: "comment",
  CommentContent: "comment_content",

  BlankLine: "blank_line",

  FrontMatter: "front_matter_start",
  FrontMatter_end: "front_matter_end",
  FrontMatterField: "front_matter_field",

  Chunk: "chunk",
  ChunkName: "chunk_name",
  Section: "section",
  SectionLevel: "section_level",
  SectionName: "section_name",

  FlowBreak: "flow_break",

  Import: "import",

  Define: "define",
  StructField: "struct_field",

  Function: "function",

  Do: "do",
  Set: "set",
  Delete: "delete",
  If: "if",
  Elseif: "elseif",
  Else: "else",
  While: "while",
  Until: "until",
  For: "for",
  End: "end",
  Continue: "continue",
  Return: "return",

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

  Image_c2: "image",
  Audio_c2: "audio",

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
  DialogueCharacterName: "dialogue_character_name",
  DialogueCharacterParenthetical: "dialogue_character_parenthetical",
  DialogueCharacterSimultaneous: "dialogue_character_simultaneous",
  DialogueBox: "dialogue_box",
  DialogueLineParenthetical_c1: "dialogue_line_parenthetical",
  BoxLineContinue: "box_line_continue",
  BoxLineComplete: "box_line_complete",
  DisplayText_c1: "display_text_prerequisite_value",
  DisplayText_c2: "display_text_prerequisite_operator",
  DisplayText_c3: "display_text_content",

  Unknown: "unknown",
};

export default SPARK_TOKEN_TAGS;
