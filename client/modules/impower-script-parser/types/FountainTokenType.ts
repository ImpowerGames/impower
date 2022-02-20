import { FountainTitleKeyword } from "./FountainTitleKeyword";

export type FountainLogicType = "declare" | "assign" | "trigger" | "compare";
export type FountainGoType = "go";
export type FountainJumpType = "jump";
export type FountainReturnType = "return";
export type FountainChoiceType = "choice";

export type FountainSectionType = "section";
export type FountainSceneType = "scene_heading";
export type FountainDialogueType = "dialogue" | "dialogue_begin" | "character";

export type FountainOtherType =
  | "title"
  | "separator"
  | "action"
  | "centered"
  | "transition"
  | "close"
  | "synopsis"
  | "separator"
  | "page_break"
  | "action"
  | "parenthetical"
  | "dialogue_end"
  | "dual_dialogue_begin"
  | "dual_dialogue_end"
  | "lyric"
  | "note"
  | "boneyard_begin"
  | "boneyard_end"
  | FountainTitleKeyword;

export type FountainTokenType =
  | FountainLogicType
  | FountainGoType
  | FountainJumpType
  | FountainReturnType
  | FountainChoiceType
  | FountainSectionType
  | FountainSceneType
  | FountainDialogueType
  | FountainOtherType;
