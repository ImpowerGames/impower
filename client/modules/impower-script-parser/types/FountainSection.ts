import { FountainAsset } from "./FountainAsset";
import { FountainTag } from "./FountainTag";
import { FountainToken } from "./FountainToken";
import { FountainVariable } from "./FountainVariable";

export interface FountainSection {
  name?: string;
  start?: number;
  line?: number;
  operator?: string;
  tokens?: FountainToken[];
  children?: string[];
  variables?: Record<string, FountainVariable>;
  tags?: Record<string, FountainTag>;
  assets?: Record<string, FountainAsset>;
}
