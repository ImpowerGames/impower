import { FountainToken } from "./FountainToken";

export interface FountainSection {
  name?: string;
  line?: number;
  tokens?: FountainToken[];
  children?: string[];
}
