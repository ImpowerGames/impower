import { FountainAsset } from "./FountainAsset";
import { FountainTokenType } from "./FountainTokenType";

export interface FountainLine {
  type: FountainTokenType;
  content?: string;
  text?: string;
  notes?: Partial<FountainAsset>[];

  line?: number;
  from?: number;
  to?: number;
  offset?: number;

  order?: number;
  ignore?: boolean;

  html?: string;
}
