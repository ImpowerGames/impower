import { FountainCallTokenType, FountainEntityTokenType } from "..";
import { FountainLine } from "./FountainLine";
import {
  FountainActionTokenType,
  FountainAssetTokenType,
  FountainAssignTokenType,
  FountainCenteredTokenType,
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
  FountainTransitionTokenType,
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
  check: "if" | "elif" | "else" | "";
  value: string;
  skipToLine: number;
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
  name: string;
  methodArgs: string[];
  index: number;
  count: number;
}

export interface FountainReturnToken extends FountainLine {
  type: FountainReturnTokenType;
  operator: string;
  value: string;
  returnToTop: boolean;
}

export interface FountainSceneToken extends FountainLine {
  type: FountainSceneTokenType;
  scene: string | number;
  wait: boolean;
}

export interface FountainPositionToken extends FountainLine {
  type: FountainPositionTokenType;
  position: "left" | "right";
  wait: boolean;
}

export interface FountainDialogueToken extends FountainLine {
  type: FountainDialogueTokenType;
  character: string;
  parenthetical: string;
  position: "left" | "right";
  assets?: { name: string }[];
  wait: boolean;
}

export interface FountainActionToken extends FountainLine {
  type: FountainActionTokenType;
  wait: boolean;
}

export interface FountainTransitionToken extends FountainLine {
  type: FountainTransitionTokenType;
  wait: boolean;
}

export interface FountainCenteredToken extends FountainLine {
  type: FountainCenteredTokenType;
  wait: boolean;
}

export interface FountainOtherToken extends FountainLine {
  type: FountainOtherTokenType;
}

export type FountainDisplayToken =
  | FountainSceneToken
  | FountainDialogueToken
  | FountainActionToken
  | FountainTransitionToken
  | FountainCenteredToken;

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
  | FountainActionToken
  | FountainTransitionToken
  | FountainCenteredToken
  | FountainOtherToken;
