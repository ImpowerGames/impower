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
    checkpoint?: SparkRange;
    name?: SparkRange;
  };
}

export interface SparkSectionToken extends ISparkToken<"section"> {
  level: number;
  name: string;

  ranges?: {
    checkpoint?: SparkRange;
    level?: SparkRange;
    name?: SparkRange;
  };
}

export interface SparkCheckpointToken extends ISparkToken<"checkpoint"> {
  id: string;
}

export interface SparkImportToken extends ISparkToken<"import"> {
  type: string;
  name: string;
  value: string;
  compiled: unknown;

  ranges?: {
    checkpoint?: SparkRange;
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}

export interface ISparkDeclarationToken<T extends string>
  extends ISparkToken<T> {
  name: string;
  operator?: string;
  value: string;
  compiled: unknown;
  fields?: ISparkStructFieldToken[];
  entriesLength?: number;

  ranges?: {
    checkpoint?: SparkRange;
    name?: SparkRange;
    operator?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkDefineToken extends ISparkDeclarationToken<"define"> {}

export interface SparkStoreToken extends ISparkDeclarationToken<"store"> {}

export interface ISparkStructFieldToken<T extends string = string>
  extends ISparkToken<T> {
  type: string;
  path: string;
  key: string;
  value: string;
  compiled: unknown;

  ranges?: {
    checkpoint?: SparkRange;
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
  name: string;

  ranges?: {
    checkpoint?: SparkRange;
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
  name: string;
  operator: string;
  value: string;
  compiled: unknown;

  ranges?: {
    checkpoint?: SparkRange;
    name?: SparkRange;
    operator?: SparkRange;
    value?: SparkRange;
  };
}

export interface SparkJumpToken extends ISparkToken<"jump"> {
  section: string;
}

export interface SparkChoiceToken extends ISparkToken<"choice"> {
  operator: string;
  section: string;
  content?: SparkTextToken[];
  ranges?: {
    checkpoint?: SparkRange;
    operator?: SparkRange;
    text?: SparkRange;
    section?: SparkRange;
  };
}

export interface SparkImageToken extends ISparkToken<"image"> {
  control: string;
  target: string;
  assets: string[];
  args: string[];

  ranges?: {
    checkpoint?: SparkRange;
    control?: SparkRange;
    target?: SparkRange;
    assets?: SparkRange;
    args?: SparkRange;
  };
}

export interface SparkAudioToken extends ISparkToken<"audio"> {
  control: string;
  target: string;
  assets: string[];
  args: string[];

  ranges?: {
    checkpoint?: SparkRange;
    control?: SparkRange;
    target?: SparkRange;
    assets?: SparkRange;
    args?: SparkRange;
  };
}

export interface SparkStyleToken extends ISparkToken<"style"> {
  control: string;
  args: string[];

  ranges?: {
    checkpoint?: SparkRange;
    control?: SparkRange;
    args?: SparkRange;
  };
}

export interface DisplayContent {
  line: number;
  from: number;
  to: number;
  indent: number;

  tag: string;
  control?: string;
  target?: string;
  instance?: number;
  button?: string;
  prerequisite?: string;
  text?: string;
  assets?: string[];
  args?: string[];
  id: string;
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
  target?: string;
  button?: string;
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
  position?: number;
  content?: DisplayContent[];
  waitUntilFinished: boolean;
  autoAdvance: boolean;

  ranges?: {
    checkpoint?: SparkRange;
    text?: SparkRange;
  };
}

export interface ISparkBoxToken<T extends string>
  extends ISparkDisplayToken<T> {}

export interface SparkTransitionToken
  extends ISparkDisplayToken<"transition"> {}

export interface SparkSceneToken extends ISparkDisplayToken<"scene"> {
  index: number;
}

export interface SparkActionToken extends ISparkBoxToken<"action"> {
  content?: SparkActionBoxToken[];
}

export interface SparkActionBoxToken extends ISparkBoxToken<"action_box"> {
  speechDuration: number;
}

export interface SparkDialogueToken extends ISparkToken<"dialogue"> {
  position?: number;
  autoAdvance: boolean;
  characterKey: string;
  characterName?: SparkDialogueCharacterNameToken;
  characterParenthetical?: SparkDialogueCharacterParentheticalToken;

  content?: SparkDialogueBoxToken[];
}

export interface SparkDialogueBoxToken extends ISparkBoxToken<"dialogue_box"> {
  characterKey: string;
  characterName?: SparkDialogueCharacterNameToken;
  characterParenthetical?: SparkDialogueCharacterParentheticalToken;
  position?: number;
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
    | "targeted_display_text_content"
    | "display_text_content"
    | "target_name"
    | "unknown"
    | "dialogue_character_simultaneous"
    | "asset_tag_control"
    | "asset_tag_target"
    | "asset_tag_target_separator"
    | "asset_tag_names"
    | "asset_tag_arguments"
    | "asset_tag_argument"
    | "style_tag_control"
    | "style_tag_arguments"
    | "style_tag_argument"
    | "choice_operator"
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
    | "separator"
    | "page_break"
  > {}

type SparkOtherTokenTagMap = {
  [t in SparkOtherToken["tag"]]: SparkOtherToken;
};

export interface SparkTokenTagMap extends SparkOtherTokenTagMap {
  comment: SparkCommentToken;
  checkpoint: SparkCheckpointToken;
  front_matter_field: SparkFrontMatterFieldToken;
  chunk: SparkChunkToken;
  section: SparkSectionToken;
  import: SparkImportToken;
  define: SparkDefineToken;
  store: SparkStoreToken;
  struct_map_item: SparkStructMapItemToken;
  struct_scalar_item: SparkStructScalarItemToken;
  struct_map_property: SparkStructMapPropertyToken;
  struct_scalar_property: SparkStructScalarPropertyToken;
  struct_blank_property: SparkStructBlankProperty;
  struct_empty_property: SparkStructEmptyProperty;
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
  style: SparkStyleToken;
  transition: SparkTransitionToken;
  scene: SparkSceneToken;
  action: SparkActionToken;
  action_box: SparkActionBoxToken;
  dialogue: SparkDialogueToken;
  dialogue_box: SparkDialogueBoxToken;
  dialogue_character_name: SparkDialogueCharacterNameToken;
  dialogue_character_parenthetical: SparkDialogueCharacterParentheticalToken;
  dialogue_line_parenthetical: SparkDialogueLineParentheticalToken;
  display_text: SparkDisplayTextToken;
  text: SparkTextToken;
}

export type SparkToken = SparkTokenTagMap[keyof SparkTokenTagMap];
