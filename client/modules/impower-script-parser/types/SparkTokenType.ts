import { SparkAssetType } from "./SparkAssetType";
import { SparkEntityType } from "./SparkEntityType";
import { SparkTitleKeyword } from "./SparkTitleKeyword";

export type SparkAssetTokenType = SparkAssetType;
export type SparkEntityTokenType = SparkEntityType;
export type SparkTagTokenType = "tag";
export type SparkVariableTokenType = "variable";
export type SparkAssignTokenType = "assign";
export type SparkCallTokenType = "call";
export type SparkConditionTokenType = "condition";
export type SparkChoiceTokenType = "choice";
export type SparkGoTokenType = "go";
export type SparkReturnTokenType = "return";

export type SparkSectionTokenType = "section";
export type SparkSceneTokenType = "scene";
export type SparkDialogueTokenType = "dialogue";
export type SparkActionTokenType = "action";
export type SparkAssetsTokenType = "assets";
export type SparkTransitionTokenType = "transition";
export type SparkCenteredTokenType = "centered";
export type SparkPositionTokenType =
  | "dialogue_begin"
  | "character"
  | "parenthetical";

export type SparkOtherTokenType =
  | "comment"
  | "title"
  | "separator"
  | "synopses"
  | "separator"
  | "page_break"
  | "dialogue_asset"
  | "action_asset"
  | "dialogue_end"
  | "dual_dialogue_begin"
  | "dual_dialogue_end"
  | "lyric"
  | "note"
  | "boneyard_begin"
  | "boneyard_end"
  | "repeat"
  | SparkTitleKeyword;

export type SparkTokenType =
  | SparkAssetTokenType
  | SparkEntityTokenType
  | SparkTagTokenType
  | SparkVariableTokenType
  | SparkAssignTokenType
  | SparkCallTokenType
  | SparkConditionTokenType
  | SparkChoiceTokenType
  | SparkGoTokenType
  | SparkReturnTokenType
  | SparkSectionTokenType
  | SparkSceneTokenType
  | SparkDialogueTokenType
  | SparkActionTokenType
  | SparkTransitionTokenType
  | SparkCenteredTokenType
  | SparkAssetsTokenType
  | SparkPositionTokenType
  | SparkOtherTokenType;
