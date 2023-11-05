import { ISparkToken } from "./ISparkToken";
import { SparkRange } from "./SparkRange";

export interface SparkCommentToken extends ISparkToken<"comment"> {
  text: string;
}

export interface SparkFrontMatterFieldToken
  extends ISparkToken<"front_matter_field"> {
  name: string;
}

export interface SparkChunkToken extends ISparkToken<"chunk"> {
  name: string;

  ranges?: {
    name?: SparkRange;
  };
}

export interface SparkSectionToken extends ISparkToken<"section"> {
  level: number;
  name: string;

  ranges?: {
    level?: SparkRange;
    name?: SparkRange;
  };
}

export interface SparkImportToken extends ISparkToken<"import"> {
  type: string;
  name: string;
  location: string;
}

export interface SparkVariableToken extends ISparkToken<"variable"> {
  type: string;
  name: string;
  value: string;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkStructToken extends ISparkToken<"struct"> {
  type: string;
  name: string;
  value: string;
  fields?: (SparkStructScalarItemToken | SparkStructScalarPropertyToken)[];
  arrayLength?: number;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}

export interface ISparkStructFieldToken<T extends string>
  extends ISparkToken<T> {
  key: string | number;
  value: string;

  ranges: {
    key?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkStructMapItemToken
  extends ISparkStructFieldToken<"struct_map_item"> {
  key: number;
  arrayLength?: number;
}

export interface SparkStructScalarItemToken
  extends ISparkStructFieldToken<"struct_scalar_item"> {
  path: string;
  key: number;
  type: string;
}

export interface SparkStructMapPropertyToken
  extends ISparkStructFieldToken<"struct_map_property"> {
  key: string;
  arrayLength?: number;
}

export interface SparkStructScalarPropertyToken
  extends ISparkStructFieldToken<"struct_scalar_property"> {
  path: string;
  key: string;
  type: string;
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
  accessor: string;
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
  name: string;
  operator: string;
  value: string;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    operator?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkAccessToken extends ISparkToken<"access"> {
  type: string;
  name: string;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
  };
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
  layer: string;
  name: string;
  args: string[];

  ranges?: {
    layer?: SparkRange;
    name?: SparkRange;
  };
}

export interface SparkAudioToken extends ISparkToken<"audio"> {
  layer: string;
  name: string;
  args: string[];

  ranges?: {
    layer?: SparkRange;
    name?: SparkRange;
  };
}

export interface ISparkDisplayToken<T extends string> extends ISparkToken<T> {
  content?: SparkToken[];
  waitUntilFinished: boolean;
  autoAdvance: boolean;
  clearOnAdvance: boolean;
}

export interface ISparkBoxToken<T extends string>
  extends ISparkDisplayToken<T> {}

export interface SparkTransitionToken extends ISparkDisplayToken<"transition"> {
  content?: SparkTransitionContentToken[];
}

export interface SparkTransitionContentToken
  extends ISparkDisplayToken<"transition_content"> {
  text: string;
}

export interface SparkSceneToken extends ISparkDisplayToken<"scene"> {
  index: number;
  content?: SparkSceneContentToken[];
}

export interface SparkSceneContentToken
  extends ISparkDisplayToken<"scene_content"> {
  text: string;
}

export interface SparkCenteredToken extends ISparkDisplayToken<"centered"> {
  content?: SparkCenteredContentToken[];
}

export interface SparkCenteredContentToken
  extends ISparkDisplayToken<"centered_content"> {
  text: string;
}

export interface SparkActionToken extends ISparkBoxToken<"action"> {}

export interface SparkActionBoxToken extends ISparkBoxToken<"action_box"> {
  content?: (
    | SparkBoxLineContinueToken
    | SparkBoxLineCompleteToken
    | SparkAudioToken
    | SparkImageToken
  )[];
  speechDuration: number;
}

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

export interface SparkDialogueBoxToken extends ISparkBoxToken<"dialogue_box"> {
  characterName: string;
  characterParenthetical: string;
  position?: "left" | "right";
  autoAdvance: boolean;
  content?: (
    | SparkDialogueLineParentheticalToken
    | SparkBoxLineContinueToken
    | SparkBoxLineCompleteToken
    | SparkAudioToken
    | SparkImageToken
  )[];
  speechDuration: number;
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
    | "break"
    | "continue"
    | "type_name"
    | "declaration_name"
    | "variable_name"
    | "property_name"
    | "function_name"
    | "struct_field"
    | "struct_map_property_start"
    | "struct_scalar_property_start"
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
  variable: SparkVariableToken;
  struct: SparkStructToken;
  struct_map_item: SparkStructMapItemToken;
  struct_scalar_item: SparkStructScalarItemToken;
  struct_map_property: SparkStructMapPropertyToken;
  struct_scalar_property: SparkStructScalarPropertyToken;
  function: SparkFunctionToken;
  call: SparkCallToken;
  assign: SparkAssignToken;
  access: SparkAccessToken;
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
