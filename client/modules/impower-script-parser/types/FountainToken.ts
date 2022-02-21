import { FountainLine } from "./FountainLine";
import {
  FountainChoiceType,
  FountainDialogueType,
  FountainGoType,
  FountainJumpType,
  FountainLogicType,
  FountainOtherType,
  FountainReturnType,
  FountainSceneType,
  FountainSectionType,
} from "./FountainTokenType";
import { FountainVariable } from "./FountainVariable";

export interface FountainLogicToken extends FountainLine {
  type: FountainLogicType;
  indent: number;
  variable: FountainVariable;
  operator: string;
  value: string | number | FountainVariable;
}

export interface FountainGoToken extends FountainLine {
  type: FountainGoType;
  operator: string;
  values: (string | number | FountainVariable)[];
}

export interface FountainJumpToken extends FountainLine {
  type: FountainJumpType;
  operator: string;
  values: (string | number | FountainVariable)[];
}

export interface FountainReturnToken extends FountainLine {
  type: FountainReturnType;
  operator: string;
  values: (string | number | FountainVariable)[];
}

export interface FountainChoiceToken extends FountainLine {
  type: FountainChoiceType;
  indent: number;
  operator: string;
}

export interface FountainSectionToken extends FountainLine {
  type: FountainSectionType;
  parameters: string[];
}

export interface FountainSceneToken extends FountainLine {
  type: FountainSceneType;
  scene: string | number;
}

export interface FountainDialogueToken extends FountainLine {
  type: FountainDialogueType;
  character: string;
  parenthetical: string;
  dialogue: string;
  dual: "left" | "right";
}

export interface FountainOtherToken extends FountainLine {
  type: FountainOtherType;
}

export type FountainToken =
  | FountainLogicToken
  | FountainGoToken
  | FountainJumpToken
  | FountainReturnToken
  | FountainChoiceToken
  | FountainSectionToken
  | FountainSceneToken
  | FountainDialogueToken
  | FountainOtherToken;
