import { FountainTitleKeyword } from "./FountainTitleKeyword";

export type FountainAssetType = "image" | "audio" | "text" | "video";
export type FountainEntityType = "element" | "component";
export type FountainTagType = "tag";
export type FountainVariableType = "variable";
export type FountainAssignType = "assign";
export type FountainCallType = "call";
export type FountainConditionType = "condition";
export type FountainChoiceType = "choice";
export type FountainGoType = "go";
export type FountainReturnType = "return";

export type FountainSectionType = "section";
export type FountainSceneType = "scene";
export type FountainDialogueType = "dialogue";
export type FountainPositionType =
  | "dialogue_begin"
  | "character"
  | "parenthetical";

export type FountainOtherType =
  | "title"
  | "separator"
  | "action"
  | "centered"
  | "transition"
  | "synopses"
  | "separator"
  | "page_break"
  | "action"
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
  | FountainAssetType
  | FountainEntityType
  | FountainTagType
  | FountainVariableType
  | FountainAssignType
  | FountainCallType
  | FountainConditionType
  | FountainChoiceType
  | FountainGoType
  | FountainReturnType
  | FountainSectionType
  | FountainSceneType
  | FountainDialogueType
  | FountainPositionType
  | FountainOtherType;
