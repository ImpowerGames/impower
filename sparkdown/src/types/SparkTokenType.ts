import { SparkEntityType } from "./SparkEntityType";
import { SparkTitleKeyword } from "./SparkTitleKeyword";
import { SparkVariableType } from "./SparkVariableType";

export type SparkEntityTokenType = SparkEntityType;
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
export type SparkEntityFieldTokenType =
  | "entity_object_field"
  | "entity_value_field";

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
  | "entity_list_value"
  | "import"
  | "more"
  | "unknown"
  | SparkTitleKeyword;

export type SparkTokenType =
  | SparkEntityTokenType
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
  | SparkEntityFieldTokenType
  | SparkOtherTokenType;
