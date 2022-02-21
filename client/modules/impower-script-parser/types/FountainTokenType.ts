import { FountainTitleKeyword } from "./FountainTitleKeyword";

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
export type FountainDialogueType =
  | "dialogue_begin"
  | "character"
  | "dialogue"
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
