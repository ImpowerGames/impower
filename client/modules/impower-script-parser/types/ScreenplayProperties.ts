export interface ScreenplayProperties {
  scenes?: {
    scene: number;
    line: number;
  }[];
  sceneLines?: number[];
  sceneNames?: string[];
  firstTokenLine?: number;
  characters?: Record<string, number[]>;
}
