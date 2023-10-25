import { ISparkToken } from "./ISparkToken";

export interface SparkCommentToken extends ISparkToken {
  tag: "comment";
  text: string;
}

export interface SparkCommentContentToken extends ISparkToken {
  tag: "comment_content";
}

export interface SparkBlankLineToken extends ISparkToken {
  tag: "blank_line";
}

export interface SparkFrontMatterScopeToken extends ISparkToken {
  tag: "front_matter_start" | "front_matter_end";
}

export interface SparkFrontMatterFieldToken extends ISparkToken {
  tag: "front_matter_field";
  name: string;
}

export interface SparkFrontMatterFieldKeywordToken extends ISparkToken {
  tag: "front_matter_field_keyword";
}

export interface SparkFrontMatterFieldItemToken extends ISparkToken {
  tag: "front_matter_field_item";
}

export interface SparkFrontMatterFieldStringToken extends ISparkToken {
  tag: "front_matter_field_string";
}

export interface SparkChunkToken extends ISparkToken {
  tag: "chunk";
  name: string;
}

export interface SparkChunkNameToken extends ISparkToken {
  tag: "chunk_name";
}

export interface SparkSectionToken extends ISparkToken {
  tag: "section";
  level: number;
  name: string;
}

export interface SparkSectionLevelToken extends ISparkToken {
  tag: "section_level";
}

export interface SparkSectionNameToken extends ISparkToken {
  tag: "section_name";
}

export interface SparkFlowBreakToken extends ISparkToken {
  tag: "flow_break";
}

export interface SparkImportToken extends ISparkToken {
  tag: "import";
  type: string;
  name: string;
  location: string;
}

export interface SparkStructToken extends ISparkToken {
  tag: "struct";
  type: string;
  name: string;
}

export interface SparkStructArrayPropertyToken extends ISparkToken {
  tag: "struct_array_property";
}

export interface SparkStructScalarPropertyToken extends ISparkToken {
  tag: "struct_scalar_property";
}

export interface SparkStructMapPropertyToken extends ISparkToken {
  tag: "struct_map_property";
}

export interface SparkFunctionToken extends ISparkToken {
  tag: "function";
  name: string;
  parameterNames: string[];
  returnType: string;
}

export interface SparkDoToken extends ISparkToken {
  tag: "do";
  name: string;
  parameterValues: string[];
}

export interface SparkSetToken extends ISparkToken {
  tag: "set";
  type: string;
  name: string;
  operator: string;
  value: string;
}

export interface SparkDeleteToken extends ISparkToken {
  tag: "delete";
  name: string;
  accessorValue: string;
}

export interface SparkBranchToken extends ISparkToken {
  tag: "if" | "elseif" | "else";
  condition: string;
}

export interface SparkRepeatToken extends ISparkToken {
  tag: "while" | "until" | "for";
  condition: string;
}

export interface SparkEndToken extends ISparkToken {
  tag: "end";
}

export interface SparkContinueToken extends ISparkToken {
  tag: "continue";
}

export interface SparkReturnToken extends ISparkToken {
  tag: "return";
  value: string;
}

export interface SparkJumpToken extends ISparkToken {
  tag: "jump";
  section: string;
}

export interface SparkJumpToSectionToken extends ISparkToken {
  tag: "jump_to_section";
}

export interface SparkChoiceToken extends ISparkToken {
  tag: "choice";
  prerequisiteValue: string;
  prerequisiteOperator: string;
  operator: "+" | "start" | "end";
  section: string;
  content?: SparkChoiceContentToken[];
}

export interface SparkChoiceContentToken extends ISparkToken {
  tag: "choice_content";
  text: string;
}

export interface SparkImageToken extends ISparkToken {
  tag: "image";
  name: string;
  args: string[];
}

export interface SparkAudioToken extends ISparkToken {
  tag: "audio";
  name: string;
  args: string[];
}

export interface SparkDisplayToken extends ISparkToken {
  content?: SparkToken[];
  waitUntilFinished: boolean;
  autoAdvance: boolean;
  clearOnAdvance: boolean;
}

export interface SparkDisplayTextPrerequisiteValueToken extends ISparkToken {
  tag: "display_text_prerequisite_value";
}

export interface SparkDisplayTextPrerequisiteOperatorToken extends ISparkToken {
  tag: "display_text_prerequisite_operator";
}

export interface SparkDisplayTextContentToken extends ISparkToken {
  tag: "display_text_content";
}

export interface SparkBoxToken extends SparkDisplayToken {}

export interface SparkTransitionToken extends SparkDisplayToken {
  tag: "transition";
}

export interface SparkTransitionContentToken extends SparkDisplayToken {
  tag: "transition_content";
  text: string;
}

export interface SparkSceneToken extends SparkDisplayToken {
  tag: "scene";
  scene: number;
}

export interface SparkSceneContentToken extends SparkDisplayToken {
  tag: "scene_content";
  text: string;
}

export interface SparkCenteredToken extends SparkDisplayToken {
  tag: "centered";
}

export interface SparkCenteredContentToken extends SparkDisplayToken {
  tag: "centered_content";
  text: string;
}

export interface SparkActionToken extends SparkBoxToken {
  tag: "action";
}

export interface SparkActionStartToken extends ISparkToken {
  tag: "action_start";
}

export interface SparkActionEndToken extends ISparkToken {
  tag: "action_end";
}

export interface SparkActionBoxToken extends SparkBoxToken {
  tag: "action_box";
}

export interface SparkUnknownToken extends ISparkToken {
  tag: "unknown";
}

export interface SparkBoxLineContinueToken extends ISparkToken {
  tag: "box_line_continue";
  prerequisiteValue: string;
  prerequisiteOperator: string;
  text: string;
}

export interface SparkBoxLineCompleteToken extends ISparkToken {
  tag: "box_line_complete";
  prerequisiteValue: string;
  prerequisiteOperator: string;
  text: string;
}

export interface SparkDialogueToken extends ISparkToken {
  tag: "dialogue";
  characterName: string;
  characterParenthetical: string;
  position?: "left" | "right";
  autoAdvance: boolean;
}

export interface SparkDialogueBoxToken extends SparkBoxToken {
  tag: "dialogue_box";
  characterName: string;
  characterParenthetical: string;
  position?: "left" | "right";
  autoAdvance: boolean;
}

export interface SparkDialogueStartToken extends ISparkToken {
  tag: "dialogue_start";
}

export interface SparkDialogueEndToken extends ISparkToken {
  tag: "dialogue_end";
}

export interface SparkDialogueCharacterNameToken extends ISparkToken {
  tag: "dialogue_character_name";
}

export interface SparkDialogueCharacterParentheticalToken extends ISparkToken {
  tag: "dialogue_character_parenthetical";
}

export interface SparkDialogueCharacterSimultaneousToken extends ISparkToken {
  tag: "dialogue_character_simultaneous";
}

export interface SparkDialogueLineParentheticalToken extends ISparkToken {
  tag: "dialogue_line_parenthetical";
  text: string;
}

export interface SparkTokenTagMap {
  comment: SparkCommentToken;
  comment_content: SparkCommentContentToken;
  blank_line: SparkBlankLineToken;
  front_matter_start: SparkFrontMatterScopeToken;
  front_matter_end: SparkFrontMatterScopeToken;
  front_matter_field: SparkFrontMatterFieldToken;
  front_matter_field_keyword: SparkFrontMatterFieldKeywordToken;
  front_matter_field_item: SparkFrontMatterFieldItemToken;
  front_matter_field_string: SparkFrontMatterFieldStringToken;
  chunk: SparkChunkToken;
  chunk_name: SparkChunkNameToken;
  section: SparkSectionToken;
  section_level: SparkSectionLevelToken;
  section_name: SparkSectionNameToken;
  flow_break: SparkFlowBreakToken;
  import: SparkImportToken;
  struct: SparkStructToken;
  struct_array_property: SparkStructArrayPropertyToken;
  struct_scalar_property: SparkStructScalarPropertyToken;
  struct_map_property: SparkStructMapPropertyToken;
  function: SparkFunctionToken;
  do: SparkDoToken;
  set: SparkSetToken;
  delete: SparkDeleteToken;
  if: SparkBranchToken;
  elseif: SparkBranchToken;
  else: SparkBranchToken;
  while: SparkRepeatToken;
  until: SparkRepeatToken;
  for: SparkRepeatToken;
  end: SparkEndToken;
  continue: SparkContinueToken;
  return: SparkReturnToken;
  jump: SparkJumpToken;
  jump_to_section: SparkJumpToSectionToken;
  choice: SparkChoiceToken;
  choice_content: SparkChoiceContentToken;
  image: SparkImageToken;
  audio: SparkAudioToken;
  transition: SparkTransitionToken;
  transition_content: SparkTransitionContentToken;
  scene: SparkSceneToken;
  scene_content: SparkSceneContentToken;
  centered: SparkCenteredToken;
  centered_content: SparkCenteredContentToken;
  unknown: SparkUnknownToken;
  action: SparkActionToken;
  action_start: SparkActionStartToken;
  action_end: SparkActionEndToken;
  action_box: SparkActionBoxToken;
  dialogue: SparkDialogueToken;
  dialogue_start: SparkDialogueStartToken;
  dialogue_end: SparkDialogueEndToken;
  dialogue_box: SparkDialogueBoxToken;
  dialogue_character_name: SparkDialogueCharacterNameToken;
  dialogue_character_parenthetical: SparkDialogueCharacterParentheticalToken;
  dialogue_character_simultaneous: SparkDialogueCharacterSimultaneousToken;
  dialogue_line_parenthetical: SparkDialogueLineParentheticalToken;
  box_line_continue: SparkBoxLineContinueToken;
  box_line_complete: SparkBoxLineCompleteToken;
  display_text_prerequisite_value: SparkDisplayTextPrerequisiteValueToken;
  display_text_prerequisite_operator: SparkDisplayTextPrerequisiteOperatorToken;
  display_text_content: SparkDisplayTextContentToken;
}

export type SparkToken = SparkTokenTagMap[keyof SparkTokenTagMap];
