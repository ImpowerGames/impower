import { ISparkDisplayToken, SparkChoiceToken } from "./SparkToken";

export interface SparkParseState {
  assets?: { name: string; args: string[]; type: string }[];
  character?: string;
  parenthetical?: string;
  displayToken?: ISparkDisplayToken;
  choiceTokens?: SparkChoiceToken[];
  newLineLength?: number;
  prependNext?: boolean;
  sceneIndex: number;
}
