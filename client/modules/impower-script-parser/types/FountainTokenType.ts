import { FountainTitleKeyword } from "./FountainTitleKeyword";

export type FountainAssetType = "image" | "audio" | "text" | "video";
export type FountainEntityType = "element" | "component";
export type FountainTagType = "tag";
export type FountainLogicType =
  | "declare"
  | "assign"
  | "trigger_group_begin"
  | "compare"
  | "trigger_group_end";
export type FountainCallType = "call";
export type FountainGoType = "go";
export type FountainJumpType = "jump";
export type FountainReturnType = "return";
export type FountainConditionType = "condition";

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
  | FountainTitleKeyword;

export type FountainTokenType =
  | FountainAssetType
  | FountainEntityType
  | FountainTagType
  | FountainLogicType
  | FountainCallType
  | FountainGoType
  | FountainJumpType
  | FountainReturnType
  | FountainConditionType
  | FountainSectionType
  | FountainSceneType
  | FountainDialogueType
  | FountainPositionType
  | FountainOtherType;
