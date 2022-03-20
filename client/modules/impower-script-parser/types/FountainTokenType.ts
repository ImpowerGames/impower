import { FountainAssetType } from "./FountainAssetType";
import { FountainEntityType } from "./FountainEntityType";
import { FountainTitleKeyword } from "./FountainTitleKeyword";

export type FountainAssetTokenType = FountainAssetType;
export type FountainEntityTokenType = FountainEntityType;
export type FountainTagTokenType = "tag";
export type FountainVariableTokenType = "variable";
export type FountainAssignTokenType = "assign";
export type FountainCallTokenType = "call";
export type FountainConditionTokenType = "condition";
export type FountainChoiceTokenType = "choice";
export type FountainGoTokenType = "go";
export type FountainReturnTokenType = "return";

export type FountainSectionTokenType = "section";
export type FountainSceneTokenType = "scene";
export type FountainDialogueTokenType = "dialogue";
export type FountainActionTokenType = "action";
export type FountainTransitionTokenType = "transition";
export type FountainCenteredTokenType = "centered";
export type FountainPositionTokenType =
  | "dialogue_begin"
  | "character"
  | "parenthetical";

export type FountainOtherTokenType =
  | "title"
  | "separator"
  | "synopses"
  | "separator"
  | "page_break"
  | "action_asset"
  | "dialogue_asset"
  | "dialogue_end"
  | "dual_dialogue_begin"
  | "dual_dialogue_end"
  | "lyric"
  | "note"
  | "boneyard_begin"
  | "boneyard_end"
  | "repeat"
  | FountainTitleKeyword;

export type FountainTokenType =
  | FountainAssetTokenType
  | FountainEntityTokenType
  | FountainTagTokenType
  | FountainVariableTokenType
  | FountainAssignTokenType
  | FountainCallTokenType
  | FountainConditionTokenType
  | FountainChoiceTokenType
  | FountainGoTokenType
  | FountainReturnTokenType
  | FountainSectionTokenType
  | FountainSceneTokenType
  | FountainDialogueTokenType
  | FountainActionTokenType
  | FountainTransitionTokenType
  | FountainCenteredTokenType
  | FountainPositionTokenType
  | FountainOtherTokenType;
