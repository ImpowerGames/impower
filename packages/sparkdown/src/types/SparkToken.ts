import { SparkLine } from "./SparkLine";
import {
  SparkActionAssetTokenType,
  SparkActionTokenType,
  SparkAssetsTokenType,
  SparkAssignTokenType,
  SparkCallTokenType,
  SparkCenteredTokenType,
  SparkChoiceTokenType,
  SparkConditionTokenType,
  SparkDialogueAssetTokenType,
  SparkDialogueTokenType,
  SparkJumpTokenType,
  SparkOtherTokenType,
  SparkPositionTokenType,
  SparkReturnTokenType,
  SparkSceneTokenType,
  SparkSectionTokenType,
  SparkStructFieldTokenType,
  SparkStructTokenType,
  SparkTransitionTokenType,
  SparkVariableTokenType,
} from "./SparkTokenType";

export interface SparkSectionToken extends SparkLine {
  type: SparkSectionTokenType;
  level: number;
}

export interface SparkVariableToken extends SparkLine {
  type: SparkVariableTokenType;
  name: string;
  operator: "=";
  value: string;
}

export interface SparkStructToken extends SparkLine {
  type: SparkStructTokenType;
  name: string;
}

export interface SparkStructFieldToken extends SparkLine {
  type: SparkStructFieldTokenType;
  struct: string;
  mark: string;
  id: string;
  index: number;
  name: string;
  valueText: string;
}

export interface SparkJumpToken extends SparkLine {
  type: SparkJumpTokenType;
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
  operator: "+" | "start" | "end";
  value: string;
  calls: Record<string, { name: string; values: string[] }>;
}

export interface SparkConditionToken extends SparkLine {
  type: SparkConditionTokenType;
  check: "if" | "elseif" | "else" | "close";
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
  character: string;
  wait: boolean;
  autoAdvance: boolean;
  clearPreviousText: boolean;
  assets?: { name: string }[];
  parenthetical?: string;
  position?: "left" | "right";
}

export interface SparkSceneToken extends SparkDisplayToken {
  type: SparkSceneTokenType;
  scene: string | number;
  environment?: "int" | "ext" | "int-ext" | "other";
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
  position?: "left" | "right";
}

export interface SparkAssetsToken extends SparkDisplayToken {
  type: SparkAssetsTokenType;
}

export interface SparkActionAssetToken extends SparkDisplayToken {
  type: SparkActionAssetTokenType;
}

export interface SparkDialogueAssetToken extends SparkDisplayToken {
  type: SparkDialogueAssetTokenType;
  position: "left" | "right";
}

export interface SparkPositionToken extends SparkDisplayToken {
  type: SparkPositionTokenType;
  position?: "left" | "right";
}

export interface SparkOtherToken extends SparkLine {
  type: SparkOtherTokenType;
}

export type SparkToken =
  | SparkStructToken
  | SparkVariableToken
  | SparkAssignToken
  | SparkCallToken
  | SparkConditionToken
  | SparkChoiceToken
  | SparkJumpToken
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
  | SparkStructFieldToken
  | SparkOtherToken;
