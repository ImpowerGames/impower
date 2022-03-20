import { FountainCallTokenType, FountainEntityTokenType } from "..";
import { FountainLine } from "./FountainLine";
import {
  FountainAssetTokenType,
  FountainAssignTokenType,
  FountainChoiceTokenType,
  FountainConditionTokenType,
  FountainDialogueTokenType,
  FountainGoTokenType,
  FountainOtherTokenType,
  FountainPositionTokenType,
  FountainReturnTokenType,
  FountainSceneTokenType,
  FountainSectionTokenType,
  FountainTagTokenType,
  FountainVariableTokenType,
} from "./FountainTokenType";

export interface FountainSectionToken extends FountainLine {
  type: FountainSectionTokenType;
}

export interface FountainVariableToken extends FountainLine {
  type: FountainVariableTokenType;
}

export interface FountainAssetToken extends FountainLine {
  type: FountainAssetTokenType;
}

export interface FountainEntityToken extends FountainLine {
  type: FountainEntityTokenType;
}

export interface FountainTagToken extends FountainLine {
  type: FountainTagTokenType;
}

export interface FountainGoToken extends FountainLine {
  type: FountainGoTokenType;
  name: string;
  methodArgs: string[];
}

export interface FountainCallToken extends FountainLine {
  type: FountainCallTokenType;
  name: string;
  methodArgs: string[];
}

export interface FountainConditionToken extends FountainLine {
  type: FountainConditionTokenType;
  value: string;
}

export interface FountainAssignToken extends FountainLine {
  type: FountainAssignTokenType;
  name: string;
  operator: string;
  value?: string;
  methodName?: string;
  methodArgs?: string[];
}

export interface FountainChoiceToken extends FountainLine {
  type: FountainChoiceTokenType;
  mark: string;
  section: string;
}

export interface FountainReturnToken extends FountainLine {
  type: FountainReturnTokenType;
  operator: string;
  value: string;
}

export interface FountainSceneToken extends FountainLine {
  type: FountainSceneTokenType;
  scene: string | number;
}

export interface FountainPositionToken extends FountainLine {
  type: FountainPositionTokenType;
  position: "left" | "right";
}

export interface FountainDialogueToken extends FountainLine {
  type: FountainDialogueTokenType;
  character: string;
  parenthetical: string;
  position: "left" | "right";
  assets?: { name: string }[];
}

export interface FountainOtherToken extends FountainLine {
  type: FountainOtherTokenType;
}

export type FountainToken =
  | FountainAssetToken
  | FountainEntityToken
  | FountainTagToken
  | FountainVariableToken
  | FountainAssignToken
  | FountainCallToken
  | FountainConditionToken
  | FountainChoiceToken
  | FountainGoToken
  | FountainReturnToken
  | FountainSectionToken
  | FountainSceneToken
  | FountainPositionToken
  | FountainDialogueToken
  | FountainOtherToken;
