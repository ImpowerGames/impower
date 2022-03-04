import { FountainTitleKeyword } from "./FountainTitleKeyword";

export type FountainAssetType = "image" | "audio" | "text" | "video";
export type FountainTagType = "tag";
export type FountainLogicType =
  | "declare"
  | "assign"
  | "trigger_group_begin"
  | "compare"
  | "trigger_group_end";
export type FountainGoType = "go";
export type FountainJumpType = "jump";
export type FountainReturnType = "return";
export type FountainChoiceType = "choice";

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
  | "synopsis"
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
  | FountainTagType
  | FountainLogicType
  | FountainGoType
  | FountainJumpType
  | FountainReturnType
  | FountainChoiceType
  | FountainSectionType
  | FountainSceneType
  | FountainDialogueType
  | FountainPositionType
  | FountainOtherType;
