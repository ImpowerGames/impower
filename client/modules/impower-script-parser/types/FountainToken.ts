import { FountainAssetType } from "..";
import { FountainLine } from "./FountainLine";
import {
  FountainChoiceType,
  FountainDialogueType,
  FountainGoType,
  FountainJumpType,
  FountainLogicType,
  FountainOtherType,
  FountainPositionType,
  FountainReturnType,
  FountainSceneType,
  FountainSectionType,
} from "./FountainTokenType";

export interface FountainAssetToken extends FountainLine {
  type: FountainAssetType;
  asset: string;
  value: string | { name: string };
}

export interface FountainLogicToken extends FountainLine {
  type: FountainLogicType;
  indent: number;
  variable: string;
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

export interface FountainChoiceToken extends FountainLine {
  type: FountainChoiceType;
  indent: number;
  operator: string;
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
  portrait: string;
  position: "left" | "right";
}

export interface FountainOtherToken extends FountainLine {
  type: FountainOtherType;
}

export type FountainToken =
  | FountainAssetToken
  | FountainLogicToken
  | FountainGoToken
  | FountainJumpToken
  | FountainReturnToken
  | FountainChoiceToken
  | FountainSectionToken
  | FountainSceneToken
  | FountainPositionToken
  | FountainDialogueToken
  | FountainOtherToken;
