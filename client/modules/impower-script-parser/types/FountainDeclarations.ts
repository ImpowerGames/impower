import { FountainAsset } from "./FountainAsset";
import { FountainEntity } from "./FountainEntity";
import { FountainTag } from "./FountainTag";
import { FountainVariable } from "./FountainVariable";

export interface FountainDeclarations {
  variables?: Record<string, FountainVariable>;
  entities?: Record<string, FountainEntity>;
  tags?: Record<string, FountainTag>;
  assets?: Record<string, FountainAsset>;
}
