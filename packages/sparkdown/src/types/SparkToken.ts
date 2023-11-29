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
  id: string;
  type: string;
  name: string;
  value: string;
  compiled: unknown;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkDefineToken extends ISparkToken<"define"> {
  id: string;
  type: string;
  name: string;
  value: string;
  compiled: unknown;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkVariableToken extends ISparkToken<"variable"> {
  id: string;
  type: string;
  name: string;
  value: string;
  compiled: unknown;

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
  compiled: unknown;
  fields?: ISparkStructFieldToken[];
  entriesLength?: number;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}

export interface ISparkStructFieldToken<T extends string = string>
  extends ISparkToken<T> {
  type: string;
  path: string;
  key: string;
  value: string;

  ranges?: {
    key?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkStructMapItemToken
  extends ISparkStructFieldToken<"struct_map_item"> {
  key: string;
  entriesLength?: number;
}

export interface SparkStructScalarItemToken
  extends ISparkStructFieldToken<"struct_scalar_item"> {
  path: string;
  key: string;
  type: string;
}

export interface SparkStructMapPropertyToken
  extends ISparkStructFieldToken<"struct_map_property"> {
  key: string;
  entriesLength?: number;
}

export interface SparkStructScalarPropertyToken
  extends ISparkStructFieldToken<"struct_scalar_property"> {
  path: string;
  key: string;
  type: string;
}

export interface SparkStructBlankProperty
  extends ISparkStructFieldToken<"struct_blank_property"> {
  path: string;
}

export interface SparkStructEmptyProperty
  extends ISparkStructFieldToken<"struct_empty_property"> {
  path: string;
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
  line: number;
  from: number;
  to: number;
  indent: number;

  tag: string;
  prerequisite?: string;
  speed?: number;
  text?: string;
  layer?: string;
  image?: string[];
  audio?: string[];
  args?: string[];
}

export interface SparkDisplayTextToken extends ISparkToken<"display_text"> {
  prerequisite: string;
  text: string;
}

export interface SparkTextToken<T extends string = "text">
  extends ISparkToken<T> {
  prerequisite: string;
  text: string;
  speed?: number;
  layer?: string;
}

export interface SparkDialogueCharacterNameToken
  extends SparkTextToken<"dialogue_character_name"> {}

export interface SparkDialogueCharacterParentheticalToken
  extends SparkTextToken<"dialogue_character_parenthetical"> {}

export interface SparkDialogueLineParentheticalToken
  extends SparkTextToken<"dialogue_line_parenthetical"> {}

export interface ISparkDisplayToken<T extends string> extends ISparkToken<T> {
  characterName?: SparkDialogueCharacterNameToken;
  characterParenthetical?: SparkDialogueCharacterParentheticalToken;
  position?: string;
  content?: DisplayContent[];
  waitUntilFinished: boolean;
  autoAdvance: boolean;
  overwriteText: boolean;
}

export interface ISparkBoxToken<T extends string>
  extends ISparkDisplayToken<T> {}

export interface SparkTransitionToken
  extends ISparkDisplayToken<"transition"> {}

export interface SparkSceneToken extends ISparkDisplayToken<"scene"> {
  index: number;
}

export interface SparkActionToken extends ISparkBoxToken<"action"> {
  boxes: SparkActionBoxToken[];
}

export interface SparkActionStartToken extends ISparkToken<"action_start"> {}

export interface SparkActionBoxToken extends ISparkBoxToken<"action_box"> {
  speechDuration: number;
}

export interface SparkDialogueToken extends ISparkToken<"dialogue"> {
  position?: "left" | "right";
  autoAdvance: boolean;
  characterName: SparkDialogueCharacterNameToken;
  characterParenthetical: SparkDialogueCharacterParentheticalToken;
  boxes: SparkDialogueBoxToken[];
}

export interface SparkDialogueStartToken
  extends ISparkToken<"dialogue_start"> {}

export interface SparkDialogueBoxToken extends ISparkBoxToken<"dialogue_box"> {
  characterName: SparkDialogueCharacterNameToken;
  characterParenthetical: SparkDialogueCharacterParentheticalToken;
  position?: "left" | "right";
  autoAdvance: boolean;
  speechDuration: number;
}

export type SparkDisplayToken =
  | SparkActionBoxToken
  | SparkDialogueBoxToken
  | SparkTransitionToken
  | SparkSceneToken;

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
    | "scalar_variable"
    | "type_name"
    | "declaration_name"
    | "variable_name"
    | "property_name"
    | "function_name"
    | "struct_map_property_start"
    | "struct_scalar_property_start"
    | "struct_field"
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
  define: SparkDefineToken;
  variable: SparkVariableToken;
  struct: SparkStructToken;
  struct_map_item: SparkStructMapItemToken;
  struct_scalar_item: SparkStructScalarItemToken;
  struct_map_property: SparkStructMapPropertyToken;
  struct_scalar_property: SparkStructScalarPropertyToken;
  struct_blank_property: SparkStructBlankProperty;
  struct_empty_property: SparkStructEmptyProperty;
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
  action: SparkActionToken;
  action_start: SparkActionStartToken;
  action_box: SparkActionBoxToken;
  dialogue: SparkDialogueToken;
  dialogue_start: SparkDialogueStartToken;
  dialogue_box: SparkDialogueBoxToken;
  dialogue_character_name: SparkDialogueCharacterNameToken;
  dialogue_character_parenthetical: SparkDialogueCharacterParentheticalToken;
  dialogue_line_parenthetical: SparkDialogueLineParentheticalToken;
  display_text: SparkDisplayTextToken;
  text: SparkTextToken;
}

export type SparkToken = SparkTokenTagMap[keyof SparkTokenTagMap];
