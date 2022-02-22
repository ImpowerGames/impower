import { FountainToken } from "./FountainToken";

export interface FountainSection {
  name?: string;
  start?: number;
  line?: number;
  tokens?: FountainToken[];
  children?: string[];
}
