import { SparkCallTokenType, SparkEntityTokenType } from "..";
import { SparkLine } from "./SparkLine";
import {
  SparkActionAssetTokenType,
  SparkActionTokenType,
  SparkAssetsTokenType,
  SparkAssetTokenType,
  SparkAssignTokenType,
  SparkCenteredTokenType,
  SparkChoiceTokenType,
  SparkConditionTokenType,
  SparkDialogueAssetTokenType,
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
  name: string;
  operator: "=";
  value: string;
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
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
}

export interface SparkCallToken extends SparkLine {
  type: SparkCallTokenType;
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
}

export interface SparkChoiceToken extends SparkLine {
  type: SparkChoiceTokenType;
  operator: "+" | "-" | "start" | "end";
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
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
  value: string;
}

export interface SparkReturnToken extends SparkLine {
  type: SparkReturnTokenType;
  operator: string;
  value: string;
}

export interface SparkDisplayToken extends SparkLine {
  wait: boolean;
  autoAdvance: boolean;
  clearPreviousText: boolean;
  clearPreviousAssets: boolean;
  assets?: { name: string }[];
}

export interface SparkSceneToken extends SparkDisplayToken {
  type: SparkSceneTokenType;
  scene: string | number;
}

export interface SparkTransitionToken extends SparkDisplayToken {
  type: SparkTransitionTokenType;
}

export interface SparkCenteredToken extends SparkDisplayToken {
  type: SparkCenteredTokenType;
}

export interface SparkActionToken extends SparkDisplayToken {
  type: SparkActionTokenType;
}

export interface SparkDialogueToken extends SparkDisplayToken {
  type: SparkDialogueTokenType;
  character: string;
  parenthetical: string;
  position: "left" | "right";
}

export interface SparkAssetsToken extends SparkDisplayToken {
  type: SparkAssetsTokenType;
}

export interface SparkActionAssetToken extends SparkDisplayToken {
  type: SparkActionAssetTokenType;
}

export interface SparkDialogueAssetToken extends SparkDisplayToken {
  type: SparkDialogueAssetTokenType;
}

export interface SparkPositionToken extends SparkDisplayToken {
  type: SparkPositionTokenType;
  position?: "left" | "right";
}

export interface SparkOtherToken extends SparkLine {
  type: SparkOtherTokenType;
}

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
  | SparkAssetsToken
  | SparkActionAssetToken
  | SparkDialogueAssetToken
  | SparkOtherToken;
