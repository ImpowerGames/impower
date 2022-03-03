import { FountainAsset, FountainVariable } from "..";
import { FountainToken } from "./FountainToken";

export interface FountainSection {
  name?: string;
  start?: number;
  line?: number;
  operator?: string;
  tokens?: FountainToken[];
  children?: string[];
  assets?: {
    image?: Record<string, FountainAsset>;
    video?: Record<string, FountainAsset>;
    audio?: Record<string, FountainAsset>;
    text?: Record<string, FountainAsset>;
  };
  variables?: Record<string, FountainVariable>;
}
