import { FountainAsset } from "./FountainAsset";
import { FountainEntity } from "./FountainEntity";
import { FountainTag } from "./FountainTag";
import { FountainToken } from "./FountainToken";
import { FountainVariable } from "./FountainVariable";

export interface FountainSection {
  type?: "section" | "function" | "method" | "detector";
  name?: string;
  from?: number;
  to?: number;
  line?: number;
  returnType?: "string" | "number" | "boolean" | "";
  tokens?: FountainToken[];
  children?: string[];
  triggers?: string[];
  variables?: Record<string, FountainVariable>;
  entities?: Record<string, FountainEntity>;
  tags?: Record<string, FountainTag>;
  assets?: Record<string, FountainAsset>;
  value?: number;
}
