import { FountainAsset } from "./FountainAsset";
import { FountainTag } from "./FountainTag";
import { FountainVariable } from "./FountainVariable";

export interface FountainDeclarations {
  variables?: Record<string, FountainVariable>;
  tags?: Record<string, FountainTag>;
  assets?: Record<string, FountainAsset>;
}
