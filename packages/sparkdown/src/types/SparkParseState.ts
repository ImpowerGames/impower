import { SparkChoiceToken, SparkDisplayToken } from "./SparkToken";

export interface SparkParseState {
  assets?: { name: string }[];
  character?: string;
  parenthetical?: string;
  displayToken?: SparkDisplayToken;
  choiceTokens?: SparkChoiceToken[];
  newLineLength?: number;
  prependNext?: boolean;
  sceneIndex?: number;
}
