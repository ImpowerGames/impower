import { ISparkToken } from "./ISparkToken";

export interface SparkCommentToken extends ISparkToken<"comment"> {
  text: string;
}

export interface SparkFrontMatterFieldToken
  extends ISparkToken<"front_matter_field"> {
  name: string;
}

export interface SparkChunkToken extends ISparkToken<"chunk"> {
  name: string;
}

export interface SparkSectionToken extends ISparkToken<"section"> {
  level: number;
  name: string;
}

export interface SparkImportToken extends ISparkToken<"import"> {
  type: string;
  name: string;
  location: string;
}

export interface SparkStructToken extends ISparkToken<"struct"> {
  type: string;
  name: string;
}

export interface SparkFunctionToken extends ISparkToken<"function"> {
  name: string;
  parameterNames: string[];
  returnType: string;
}

export interface SparkReturnToken extends ISparkToken<"return"> {
  value: string;
}

export interface SparkDeleteToken extends ISparkToken<"delete"> {
  name: string;
  accessorValue: string;
}

export interface SparkBranchToken
  extends ISparkToken<"if" | "elseif" | "else"> {
  condition: string;
}

export interface SparkRepeatToken
  extends ISparkToken<"while" | "until" | "for"> {
  condition: string;
}

export interface SparkCallToken extends ISparkToken<"call"> {
  name: string;
  parameterValues: string[];
}

export interface SparkAssignToken extends ISparkToken<"assign"> {
  type: string;
  target: string;
  operator: string;
  value: string;
}

export interface SparkJumpToken extends ISparkToken<"jump"> {
  section: string;
}

export interface SparkChoiceToken extends ISparkToken<"choice"> {
  prerequisiteValue: string;
  prerequisiteOperator: string;
  operator: "+" | "start" | "end";
  section: string;
  content?: SparkChoiceContentToken[];
}

export interface SparkChoiceContentToken extends ISparkToken<"choice_content"> {
  text: string;
}

export interface SparkImageToken extends ISparkToken<"image"> {
  name: string;
  args: string[];
}

export interface SparkAudioToken extends ISparkToken<"audio"> {
  name: string;
  args: string[];
}

export interface SparkDisplayToken<T extends string> extends ISparkToken<T> {
  content?: SparkToken[];
  waitUntilFinished: boolean;
  autoAdvance: boolean;
  clearOnAdvance: boolean;
}

export interface SparkBoxToken<T extends string> extends SparkDisplayToken<T> {}

export interface SparkTransitionToken extends SparkDisplayToken<"transition"> {}

export interface SparkTransitionContentToken
  extends SparkDisplayToken<"transition_content"> {
  text: string;
}

export interface SparkSceneToken extends SparkDisplayToken<"scene"> {
  scene: number;
}

export interface SparkSceneContentToken
  extends SparkDisplayToken<"scene_content"> {
  text: string;
}

export interface SparkCenteredToken extends SparkDisplayToken<"centered"> {}

export interface SparkCenteredContentToken
  extends SparkDisplayToken<"centered_content"> {
  text: string;
}

export interface SparkActionToken extends SparkBoxToken<"action"> {}

export interface SparkActionBoxToken extends SparkBoxToken<"action_box"> {}

export interface SparkBoxLineContinueToken
  extends ISparkToken<"box_line_continue"> {
  prerequisiteValue: string;
  prerequisiteOperator: string;
  text: string;
}

export interface SparkBoxLineCompleteToken
  extends ISparkToken<"box_line_complete"> {
  prerequisiteValue: string;
  prerequisiteOperator: string;
  text: string;
}

export interface SparkDialogueLineParentheticalToken
  extends ISparkToken<"dialogue_line_parenthetical"> {
  text: string;
}

export interface SparkDialogueToken extends ISparkToken<"dialogue"> {
  characterName: string;
  characterParenthetical: string;
  position?: "left" | "right";
  autoAdvance: boolean;
}

export interface SparkDialogueBoxToken extends SparkBoxToken<"dialogue_box"> {
  characterName: string;
  characterParenthetical: string;
  position?: "left" | "right";
  autoAdvance: boolean;
}

export interface SparkOtherToken
  extends ISparkToken<
    | "comment_content"
    | "front_matter_start"
    | "front_matter_end"
    | "front_matter_field_keyword"
    | "front_matter_field_item"
    | "front_matter_field_string"
    | "chunk_name"
    | "section_level"
    | "section_name"
    | "flow_break"
    | "struct_map_item"
    | "struct_scalar_item"
    | "struct_map_property"
    | "struct_scalar_property"
    | "break"
    | "continue"
    | "type_name"
    | "identifier_path"
    | "assign_operator"
    | "value_text"
    | "jump_to_section"
    | "display_text_prerequisite_value"
    | "display_text_prerequisite_operator"
    | "display_text_content"
    | "action_start"
    | "action_end"
    | "unknown"
    | "dialogue_start"
    | "dialogue_end"
    | "dialogue_character_name"
    | "dialogue_character_parenthetical"
    | "dialogue_character_simultaneous"
  > {}

type SparkOtherTokenTagMap = {
  [t in SparkOtherToken["tag"]]: SparkOtherToken;
};

export interface SparkTokenTagMap extends SparkOtherTokenTagMap {
  comment: SparkCommentToken;
  front_matter_field: SparkFrontMatterFieldToken;
  chunk: SparkChunkToken;
  section: SparkSectionToken;
  import: SparkImportToken;
  struct: SparkStructToken;
  function: SparkFunctionToken;
  call: SparkCallToken;
  assign: SparkAssignToken;
  delete: SparkDeleteToken;
  if: SparkBranchToken;
  elseif: SparkBranchToken;
  else: SparkBranchToken;
  while: SparkRepeatToken;
  until: SparkRepeatToken;
  for: SparkRepeatToken;
  return: SparkReturnToken;
  jump: SparkJumpToken;
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
  action: SparkActionToken;
  action_box: SparkActionBoxToken;
  dialogue: SparkDialogueToken;
  dialogue_box: SparkDialogueBoxToken;
  dialogue_line_parenthetical: SparkDialogueLineParentheticalToken;
  box_line_continue: SparkBoxLineContinueToken;
  box_line_complete: SparkBoxLineCompleteToken;
}

export type SparkToken = SparkTokenTagMap[keyof SparkTokenTagMap];
