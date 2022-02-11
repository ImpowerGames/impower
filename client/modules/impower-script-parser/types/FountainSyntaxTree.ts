import { FountainTokenType } from "./FountainTokenType";

export interface FountainContainer {
  id?: string;
  level?: number;
  text?: string;
  synopses?: { synopsis: string; line: number }[];
  notes?: { note: string; line: number }[];
  children?: FountainContainer[]; // Children of the section
}

export interface ScreenplayProperties {
  scenes?: {
    scene: number;
    line: number;
  }[];
  sceneLines?: number[];
  sceneNames?: string[];
  firstTokenLine?: number;
  characters?: Record<string, number[]>;
  structure?: FountainContainer[];
}

export interface FountainToken {
  type: FountainTokenType;

  text?: string;
  scene?: number; // Only populated when type === "scene_heading"
  character?: string; // Only populated when type === "dialogue"
  parenthetical?: string; // Only populated when type === "dialogue"
  dual?: "left" | "right"; // Only populated when type === "dialogue"

  error?: string;

  order?: number;
  ignore?: boolean;

  line?: number;
  level?: number;
  start?: number;
  end?: number;
  html?: string;
}

export interface FountainSyntaxTree {
  titleTokens?: { [key: string]: FountainToken[] };
  scriptTokens: FountainToken[];
  scriptTokenLines?: { [line: number]: number };
  properties?: ScreenplayProperties;
}
