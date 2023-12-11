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

export interface SparkCheckpointToken extends ISparkToken<"checkpoint"> {
  checkpoint: string;

  ranges?: {
    checkpoint?: SparkRange;
  };
}

export interface SparkImportToken extends ISparkToken<"import"> {
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

export interface ISparkDeclarationToken<T extends string>
  extends ISparkToken<T> {
  type: string;
  name: string;
  access_operator?: string;
  assign_operator?: string;
  value: string;
  compiled: unknown;
  fields?: ISparkStructFieldToken[];
  entriesLength?: number;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    access_operator?: SparkRange;
    assign_operator?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkDefineToken extends ISparkDeclarationToken<"define"> {}

export interface SparkStoreToken extends ISparkDeclarationToken<"store"> {
  content?: SparkAccessPartToken[];
}

export interface ISparkStructFieldToken<T extends string = string>
  extends ISparkToken<T> {
  type: string;
  path: string;
  key: string;
  value: string;
  compiled: unknown;

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
  type: string;
  name: string;

  ranges?: {
    name?: SparkRange;
  };
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
  type: string;
  name: string;
  assign_operator: string;
  value: string;
  content?: SparkAccessPartToken[];

  ranges?: {
    name?: SparkRange;
    assign_operator?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkAccessPartToken extends ISparkToken<"access_part"> {
  text: string;
}

export interface SparkJumpToken extends ISparkToken<"jump"> {
  section: string;
}

export interface SparkChoiceToken extends ISparkToken<"choice"> {
  section: string;
  content?: SparkTextToken[];
}

export interface SparkImageToken extends ISparkToken<"image"> {
  target: string;
  image: string[];
  args: string[];
  nameRanges: SparkRange[];

  ranges?: {
    target?: SparkRange;
    image?: SparkRange;
    args?: SparkRange;
  };
}

export interface SparkAudioToken extends ISparkToken<"audio"> {
  target: string;
  audio: string[];
  args: string[];
  nameRanges: SparkRange[];

  ranges?: {
    target?: SparkRange;
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
  target?: string;
  image?: string[];
  audio?: string[];
  args?: string[];
}

export interface SparkDisplayTextToken extends ISparkToken<"display_text"> {
  prerequisite: string;
  text: string;
  target: string;
}

export interface SparkTextToken<T extends string = "text">
  extends ISparkToken<T> {
  prerequisite?: string;
  text: string;
  speed?: number;
  target?: string;
}

export interface SparkDialogueCharacterNameToken
  extends SparkTextToken<"dialogue_character_name"> {}

export interface SparkDialogueCharacterParentheticalToken
  extends SparkTextToken<"dialogue_character_parenthetical"> {}

export interface SparkDialogueLineParentheticalToken
  extends SparkTextToken<"dialogue_line_parenthetical"> {}

export interface ISparkDisplayToken<T extends string> extends ISparkToken<T> {
  characterKey?: string;
  characterName?: SparkDialogueCharacterNameToken;
  characterParenthetical?: SparkDialogueCharacterParentheticalToken;
  position?: string;
  content?: DisplayContent[];
  waitUntilFinished: boolean;
  autoAdvance: boolean;
  checkpoint: string;

  ranges?: {
    checkpoint?: SparkRange;
  };
}

export interface ISparkBoxToken<T extends string>
  extends ISparkDisplayToken<T> {}

export interface SparkTransitionToken
  extends ISparkDisplayToken<"transition"> {}

export interface SparkSceneToken extends ISparkDisplayToken<"scene"> {
  index: number;
}

export interface SparkActionToken extends ISparkBoxToken<"action"> {}

export interface SparkActionStartToken extends ISparkToken<"action_start"> {}

export interface SparkActionBoxToken extends ISparkBoxToken<"action_box"> {
  speechDuration: number;
}

export interface SparkDialogueToken extends ISparkToken<"dialogue"> {
  position?: "left" | "right";
  autoAdvance: boolean;
  characterKey: string;
  characterName: SparkDialogueCharacterNameToken;
  characterParenthetical: SparkDialogueCharacterParentheticalToken;
}

export interface SparkDialogueStartToken
  extends ISparkToken<"dialogue_start"> {}

export interface SparkDialogueBoxToken extends ISparkBoxToken<"dialogue_box"> {
  characterKey: string;
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
    | "checkpoint_name"
    | "flow_break"
    | "break"
    | "continue"
    | "type_name"
    | "declaration_type"
    | "declaration_access_operator"
    | "declaration_name"
    | "declaration_assign_operator"
    | "declaration_property"
    | "target_access_path"
    | "access_path"
    | "variable_name"
    | "property_name"
    | "function_name"
    | "struct_colon"
    | "struct_field"
    | "struct_map_property_start"
    | "struct_scalar_property_start"
    | "assign_operator"
    | "value_text"
    | "jump_to_section"
    | "display_text_prerequisite_value"
    | "display_text_prerequisite_operator"
    | "display_text_target"
    | "display_text_content"
    | "action_end"
    | "unknown"
    | "dialogue_end"
    | "dialogue_character_simultaneous"
    | "asset_target"
    | "asset_names"
    | "asset_args"
    | "string"
    | "color"
    | "newline"
    | "whitespace"
    | "indent"
    | "punctuation_semicolon"
    | "punctuation_comma"
    | "punctuation_accessor"
    | "punctuation_paren_open"
    | "punctuation_paren_close"
    | "operator"
    | "literal"
    | "illegal"
  > {}

type SparkOtherTokenTagMap = {
  [t in SparkOtherToken["tag"]]: SparkOtherToken;
};

export interface SparkTokenTagMap extends SparkOtherTokenTagMap {
  comment: SparkCommentToken;
  front_matter_field: SparkFrontMatterFieldToken;
  chunk: SparkChunkToken;
  section: SparkSectionToken;
  checkpoint: SparkCheckpointToken;
  import: SparkImportToken;
  define: SparkDefineToken;
  store: SparkStoreToken;
  struct_map_item: SparkStructMapItemToken;
  struct_scalar_item: SparkStructScalarItemToken;
  struct_map_property: SparkStructMapPropertyToken;
  struct_scalar_property: SparkStructScalarPropertyToken;
  struct_blank_property: SparkStructBlankProperty;
  struct_empty_property: SparkStructEmptyProperty;
  access_part: SparkAccessPartToken;
  function: SparkFunctionToken;
  call: SparkCallToken;
  assign: SparkAssignToken;
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
