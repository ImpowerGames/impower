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
  id: string;
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
  extends ISparkToken<"if" | "elseif" | "else" | "end"> {
  condition: string;
}

export interface SparkRepeatToken
  extends ISparkToken<"while" | "until" | "for" | "end"> {
  condition: string;
}

export interface SparkCallToken extends ISparkToken<"call"> {
  name: string;
  parameterValues: string[];
}

export interface SparkAssignToken extends ISparkToken<"assign"> {
  name: string;
  operator: string;
  value: string;

  ranges?: {
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
  operator: "+" | "start" | "end";
  section: string;
  content?: SparkTextToken[];
}

export interface SparkImageToken extends ISparkToken<"image"> {
  layer: string;
  image: string[];
  args: string[];
  nameRanges: SparkRange[];

  ranges?: {
    layer?: SparkRange;
    image?: SparkRange;
    args?: SparkRange;
  };
}

export interface SparkAudioToken extends ISparkToken<"audio"> {
  layer: string;
  audio: string[];
  args: string[];
  nameRanges: SparkRange[];

  ranges?: {
    layer?: SparkRange;
    audio?: SparkRange;
    args?: SparkRange;
  };
}

export interface DisplayContent {
  tag: string;
  line: number;
  from: number;
  to: number;
  indent: number;
  text?: string;
  layer?: string;
  image?: string[];
  audio?: string[];
  args?: string[];
}

export interface SparkDisplayTextToken extends ISparkToken<"display_text"> {
  prerequisiteValue: string;
  prerequisiteOperator: string;
  text: string;
}

export interface SparkTextToken extends ISparkToken<"text"> {
  prerequisiteValue: string;
  prerequisiteOperator: string;
  text: string;
}

export interface ISparkDisplayToken<T extends string> extends ISparkToken<T> {
  characterName?: string;
  characterParenthetical?: string;
  position?: string;
  content?: DisplayContent[];
  waitUntilFinished: boolean;
  autoAdvance: boolean;
  clearOnAdvance: boolean;
}

export interface ISparkBoxToken<T extends string>
  extends ISparkDisplayToken<T> {}

export interface SparkTransitionToken extends ISparkDisplayToken<"transition"> {
  content?: SparkTextToken[];
}

export interface SparkSceneToken extends ISparkDisplayToken<"scene"> {
  index: number;
  content?: SparkTextToken[];
}

export interface SparkCenteredToken extends ISparkDisplayToken<"centered"> {
  content?: SparkTextToken[];
}

export interface SparkActionToken extends ISparkBoxToken<"action"> {
  start: SparkActionStartToken;
  boxes: SparkActionBoxToken[];
}

export interface SparkActionStartToken extends ISparkToken<"action_start"> {}

export interface SparkActionBoxToken extends ISparkBoxToken<"action_box"> {
  content?: (
    | SparkActionStartToken
    | SparkTextToken
    | SparkAudioToken
    | SparkImageToken
  )[];
  speechDuration: number;
}

export interface SparkDialogueLineParentheticalToken
  extends ISparkToken<"dialogue_line_parenthetical"> {
  text: string;
  layer: "parenthetical";
}

export interface SparkDialogueToken extends ISparkToken<"dialogue"> {
  characterName: string;
  characterParenthetical: string;
  position?: "left" | "right";
  autoAdvance: boolean;
  start: SparkDialogueStartToken;
  boxes: SparkDialogueBoxToken[];
}

export interface SparkDialogueStartToken
  extends ISparkToken<"dialogue_start"> {}

export interface SparkDialogueBoxToken extends ISparkBoxToken<"dialogue_box"> {
  characterName: string;
  characterParenthetical: string;
  position?: "left" | "right";
  autoAdvance: boolean;
  content?: (
    | SparkDialogueStartToken
    | SparkDialogueLineParentheticalToken
    | SparkTextToken
    | SparkAudioToken
    | SparkImageToken
  )[];
  speechDuration: number;
}

export type SparkDisplayToken =
  | SparkActionBoxToken
  | SparkDialogueBoxToken
  | SparkTransitionToken
  | SparkSceneToken
  | SparkCenteredToken;

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
    | "action_end"
    | "unknown"
    | "dialogue_end"
    | "dialogue_character_name"
    | "dialogue_character_parenthetical"
    | "dialogue_character_simultaneous"
    | "asset_layer"
    | "asset_names"
    | "asset_args"
    | "indent"
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
  end: SparkBranchToken;
  while: SparkRepeatToken;
  until: SparkRepeatToken;
  for: SparkRepeatToken;
  return: SparkReturnToken;
  jump: SparkJumpToken;
  choice: SparkChoiceToken;
  image: SparkImageToken;
  audio: SparkAudioToken;
  transition: SparkTransitionToken;
  scene: SparkSceneToken;
  centered: SparkCenteredToken;
  action: SparkActionToken;
  action_start: SparkActionStartToken;
  action_box: SparkActionBoxToken;
  dialogue: SparkDialogueToken;
  dialogue_start: SparkDialogueStartToken;
  dialogue_box: SparkDialogueBoxToken;
  dialogue_line_parenthetical: SparkDialogueLineParentheticalToken;
  display_text: SparkDisplayTextToken;
  text: SparkTextToken;
}

export type SparkToken = SparkTokenTagMap[keyof SparkTokenTagMap];
