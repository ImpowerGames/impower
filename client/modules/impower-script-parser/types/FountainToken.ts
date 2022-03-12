import { FountainCallType, FountainEntityType } from "..";
import { FountainLine } from "./FountainLine";
import {
  FountainAssetType,
  FountainAssignType,
  FountainChoiceType,
  FountainConditionType,
  FountainDeclareType,
  FountainDialogueType,
  FountainGoType,
  FountainJumpType,
  FountainOtherType,
  FountainPositionType,
  FountainReturnType,
  FountainSceneType,
  FountainSectionType,
  FountainTagType,
} from "./FountainTokenType";

export interface FountainAssetToken extends FountainLine {
  type: FountainAssetType;
  name: string;
  value: string | { name: string };
}

export interface FountainEntityToken extends FountainLine {
  type: FountainEntityType;
  name: string;
  value: string | { name: string };
}

export interface FountainTagToken extends FountainLine {
  type: FountainTagType;
  name: string;
  value: string | { name: string };
}

export interface FountainDeclareToken extends FountainLine {
  type: FountainDeclareType;
  indent: number;
  name: string;
  operator: string;
  value: string | number | { name: string };
}

export interface FountainAssignToken extends FountainLine {
  type: FountainAssignType;
  indent: number;
  name: string;
  operator: string;
  value: string | number | { name: string };
}

export interface FountainCallToken extends FountainLine {
  type: FountainCallType;
  indent: number;
  name: string;
  values: (string | number | { name: string })[];
}

export interface FountainConditionToken extends FountainLine {
  type: FountainConditionType;
  indent: number;
  name: string;
  operator: string;
  value: string | number | { name: string };
}

export interface FountainChoiceToken extends FountainLine {
  type: FountainChoiceType;
  indent: number;
  mark: string;
  section: string;
}

export interface FountainGoToken extends FountainLine {
  type: FountainGoType;
  operator: string;
  values: (string | number | { name: string })[];
}

export interface FountainJumpToken extends FountainLine {
  type: FountainJumpType;
  operator: string;
  values: (string | number | { name: string })[];
}

export interface FountainReturnToken extends FountainLine {
  type: FountainReturnType;
  operator: string;
  values: (string | number | { name: string })[];
}

export interface FountainSectionToken extends FountainLine {
  type: FountainSectionType;
  operator: string;
  parameters: string[];
}

export interface FountainSceneToken extends FountainLine {
  type: FountainSceneType;
  scene: string | number;
}

export interface FountainPositionToken extends FountainLine {
  type: FountainPositionType;
  position: "left" | "right";
}

export interface FountainDialogueToken extends FountainLine {
  type: FountainDialogueType;
  character: string;
  parenthetical: string;
  position: "left" | "right";
  assets?: { name: string }[];
}

export interface FountainOtherToken extends FountainLine {
  type: FountainOtherType;
}

export type FountainToken =
  | FountainAssetToken
  | FountainEntityToken
  | FountainTagToken
  | FountainDeclareToken
  | FountainAssignToken
  | FountainCallToken
  | FountainConditionToken
  | FountainChoiceToken
  | FountainGoToken
  | FountainJumpToken
  | FountainReturnToken
  | FountainSectionToken
  | FountainSceneToken
  | FountainPositionToken
  | FountainDialogueToken
  | FountainOtherToken;
