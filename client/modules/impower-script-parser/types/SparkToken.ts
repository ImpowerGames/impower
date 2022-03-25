import { SparkCallTokenType, SparkEntityTokenType } from "..";
import { SparkLine } from "./SparkLine";
import {
  SparkActionTokenType,
  SparkAssetTokenType,
  SparkAssignTokenType,
  SparkCenteredTokenType,
  SparkChoiceTokenType,
  SparkConditionTokenType,
  SparkDialogueTokenType,
  SparkGoTokenType,
  SparkOtherTokenType,
  SparkPositionTokenType,
  SparkReturnTokenType,
  SparkSceneTokenType,
  SparkSectionTokenType,
  SparkTagTokenType,
  SparkTransitionTokenType,
  SparkVariableTokenType,
} from "./SparkTokenType";

export interface SparkSectionToken extends SparkLine {
  type: SparkSectionTokenType;
}

export interface SparkVariableToken extends SparkLine {
  type: SparkVariableTokenType;
}

export interface SparkAssetToken extends SparkLine {
  type: SparkAssetTokenType;
}

export interface SparkEntityToken extends SparkLine {
  type: SparkEntityTokenType;
}

export interface SparkTagToken extends SparkLine {
  type: SparkTagTokenType;
}

export interface SparkGoToken extends SparkLine {
  type: SparkGoTokenType;
  name: string;
  methodArgs: string[];
}

export interface SparkCallToken extends SparkLine {
  type: SparkCallTokenType;
  name: string;
  methodArgs: string[];
}

export interface SparkConditionToken extends SparkLine {
  type: SparkConditionTokenType;
  check: "if" | "elif" | "else" | "close";
  value: string;
}

export interface SparkAssignToken extends SparkLine {
  type: SparkAssignTokenType;
  name: string;
  operator: string;
  value?: string;
  methodName?: string;
  methodArgs?: string[];
}

export interface SparkChoiceToken extends SparkLine {
  type: SparkChoiceTokenType;
  mark: string;
  name: string;
  methodArgs: string[];
  index: number;
  count: number;
}

export interface SparkReturnToken extends SparkLine {
  type: SparkReturnTokenType;
  operator: string;
  value: string;
  returnToTop: boolean;
}

export interface SparkSceneToken extends SparkLine {
  type: SparkSceneTokenType;
  scene: string | number;
  wait: boolean;
}

export interface SparkPositionToken extends SparkLine {
  type: SparkPositionTokenType;
  position: "left" | "right";
  wait: boolean;
}

export interface SparkDialogueToken extends SparkLine {
  type: SparkDialogueTokenType;
  character: string;
  parenthetical: string;
  position: "left" | "right";
  assets?: { name: string }[];
  wait: boolean;
}

export interface SparkActionToken extends SparkLine {
  type: SparkActionTokenType;
  wait: boolean;
}

export interface SparkTransitionToken extends SparkLine {
  type: SparkTransitionTokenType;
  wait: boolean;
}

export interface SparkCenteredToken extends SparkLine {
  type: SparkCenteredTokenType;
  wait: boolean;
}

export interface SparkOtherToken extends SparkLine {
  type: SparkOtherTokenType;
}

export type SparkDisplayToken =
  | SparkSceneToken
  | SparkDialogueToken
  | SparkActionToken
  | SparkTransitionToken
  | SparkCenteredToken;

export type SparkToken =
  | SparkAssetToken
  | SparkEntityToken
  | SparkTagToken
  | SparkVariableToken
  | SparkAssignToken
  | SparkCallToken
  | SparkConditionToken
  | SparkChoiceToken
  | SparkGoToken
  | SparkReturnToken
  | SparkSectionToken
  | SparkSceneToken
  | SparkPositionToken
  | SparkDialogueToken
  | SparkActionToken
  | SparkTransitionToken
  | SparkCenteredToken
  | SparkOtherToken;
