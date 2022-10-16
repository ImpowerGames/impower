import { SparkStructType } from "./SparkStructType";
import { SparkTitleKeyword } from "./SparkTitleKeyword";
import { SparkVariableType } from "./SparkVariableType";

export type SparkStructTokenType = SparkStructType;
export type SparkVariableTokenType = SparkVariableType;
export type SparkAssignTokenType = "assign";
export type SparkCallTokenType = "call";
export type SparkConditionTokenType = "condition";
export type SparkChoiceTokenType = "choice";
export type SparkJumpTokenType = "jump";
export type SparkReturnTokenType = "return";

export type SparkSectionTokenType = "section";
export type SparkSceneTokenType = "scene";
export type SparkDialogueTokenType = "dialogue";
export type SparkActionTokenType = "action";
export type SparkAssetsTokenType = "assets";
export type SparkActionAssetTokenType = "action_asset";
export type SparkDialogueAssetTokenType = "dialogue_asset";
export type SparkTransitionTokenType = "transition";
export type SparkCenteredTokenType = "centered";
export type SparkPositionTokenType =
  | "dialogue_start"
  | "character"
  | "parenthetical";
export type SparkStructFieldTokenType =
  | "struct_object_field"
  | "struct_value_field";

export type SparkOtherTokenType =
  | "comment"
  | "title"
  | "separator"
  | "synopsis"
  | "separator"
  | "page_break"
  | "dialogue_end"
  | "dual_dialogue_start"
  | "dual_dialogue_end"
  | "lyric"
  | "note"
  | "boneyard_start"
  | "boneyard_end"
  | "repeat"
  | "struct_list_value"
  | "import"
  | "more"
  | "unknown"
  | SparkTitleKeyword;

export type SparkTokenType =
  | SparkStructTokenType
  | SparkVariableTokenType
  | SparkAssignTokenType
  | SparkCallTokenType
  | SparkConditionTokenType
  | SparkChoiceTokenType
  | SparkJumpTokenType
  | SparkReturnTokenType
  | SparkSectionTokenType
  | SparkSceneTokenType
  | SparkDialogueTokenType
  | SparkActionTokenType
  | SparkTransitionTokenType
  | SparkCenteredTokenType
  | SparkAssetsTokenType
  | SparkActionAssetTokenType
  | SparkDialogueAssetTokenType
  | SparkPositionTokenType
  | SparkStructFieldTokenType
  | SparkOtherTokenType;