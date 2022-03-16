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

export interface FountainAssetToken extends FountainLine {
  type: FountainAssetTokenType;
  name: string;
  value: string | { name: string };
}

export interface FountainEntityToken extends FountainLine {
  type: FountainEntityTokenType;
  name: string;
  value: string | { name: string };
}

export interface FountainTagToken extends FountainLine {
  type: FountainTagTokenType;
  name: string;
  value: string | { name: string };
}

export interface FountainVariableToken extends FountainLine {
  type: FountainVariableTokenType;
  name: string;
  operator: string;
  value: string | number | { name: string };
}

export interface FountainAssignToken extends FountainLine {
  type: FountainAssignTokenType;
  name: string;
  operator: string;
  value: string | number | { name: string };
}

export interface FountainCallToken extends FountainLine {
  type: FountainCallTokenType;
  name: string;
  values: (string | number | { name: string })[];
}

export interface FountainConditionToken extends FountainLine {
  type: FountainConditionTokenType;
  name: string;
  operator: string;
  value: string | number | { name: string };
}

export interface FountainChoiceToken extends FountainLine {
  type: FountainChoiceTokenType;
  mark: string;
  section: string;
}

export interface FountainGoToken extends FountainLine {
  type: FountainGoTokenType;
  name: string;
  values: (string | number | { name: string })[];
}

export interface FountainReturnToken extends FountainLine {
  type: FountainReturnTokenType;
  operator: string;
  value: string | number | { name: string };
}

export interface FountainSectionToken extends FountainLine {
  type: FountainSectionTokenType;
  operator: string;
  parameters: string[];
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
