import { FountainToken } from "./FountainToken";

export interface FountainSection {
  name?: string;
  start?: number;
  line?: number;
  operator?: string;
  tokens?: FountainToken[];
  children?: string[];
}
