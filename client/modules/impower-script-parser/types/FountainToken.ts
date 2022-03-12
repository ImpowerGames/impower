import { FountainCallType, FountainEntityType } from "..";
import { FountainLine } from "./FountainLine";
import {
  FountainAssetType,
  FountainConditionType,
  FountainDialogueType,
  FountainGoType,
  FountainJumpType,
  FountainLogicType,
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

export interface FountainCallToken extends FountainLine {
  type: FountainCallType;
  values: (string | number | { name: string })[];
}

export interface FountainLogicToken extends FountainLine {
  type: FountainLogicType;
  indent: number;
  name: string;
  operator: string;
  value: string | number | { name: string };
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

export interface FountainConditionToken extends FountainLine {
  type: FountainConditionType;
  indent: number;
  mark: string;
  name: string;
  operator: string;
  value: string | number | { name: string };
  section: string;
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
  | FountainLogicToken
  | FountainCallToken
  | FountainGoToken
  | FountainJumpToken
  | FountainReturnToken
  | FountainConditionToken
  | FountainSectionToken
  | FountainSceneToken
  | FountainPositionToken
  | FountainDialogueToken
  | FountainOtherToken;
