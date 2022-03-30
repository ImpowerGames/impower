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

export interface SparkSceneToken extends SparkLine {
  type: SparkSceneTokenType;
  scene: string | number;
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
}

export interface SparkTransitionToken extends SparkLine {
  type: SparkTransitionTokenType;
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
}

export interface SparkCenteredToken extends SparkLine {
  type: SparkCenteredTokenType;
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
}

export interface SparkActionToken extends SparkLine {
  type: SparkActionTokenType;
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
  assets?: { name: string }[];
}

export interface SparkDialogueToken extends SparkLine {
  type: SparkDialogueTokenType;
  character: string;
  parenthetical: string;
  position: "left" | "right";
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
  assets?: { name: string }[];
}

export interface SparkAssetsToken extends SparkLine {
  type: SparkAssetsTokenType;
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
  assets?: { name: string }[];
}

export interface SparkActionAssetToken extends SparkLine {
  type: SparkActionAssetTokenType;
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
  assets?: { name: string }[];
}

export interface SparkDialogueAssetToken extends SparkLine {
  type: SparkDialogueAssetTokenType;
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
  assets?: { name: string }[];
}

export interface SparkPositionToken extends SparkLine {
  type: SparkPositionTokenType;
  position: "left" | "right";
  wait: boolean;
  continuePrevious: boolean;
  autoAdvance: boolean;
}

export interface SparkOtherToken extends SparkLine {
  type: SparkOtherTokenType;
}

export type SparkDisplayToken =
  | SparkSceneToken
  | SparkDialogueToken
  | SparkActionToken
  | SparkTransitionToken
  | SparkCenteredToken
  | SparkAssetsToken
  | SparkActionAssetToken
  | SparkDialogueAssetToken;

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
