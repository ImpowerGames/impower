import { FountainAsset } from "./FountainAsset";
import { FountainTokenType } from "./FountainTokenType";

export interface FountainLine {
  type: FountainTokenType;
  content?: string;
  text?: string;
  notes?: Partial<FountainAsset>[];

  line?: number;
  level?: number;
  start?: number;
  end?: number;
  indent?: number;

  order?: number;
  ignore?: boolean;

  html?: string;
}
