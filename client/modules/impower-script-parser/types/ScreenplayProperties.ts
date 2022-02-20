export interface ScreenplayProperties {
  scenes?: {
    name: string;
    scene: string | number;
    line: number;
  }[];
  sceneNames?: string[];
  firstTokenLine?: number;
  characters?: Record<string, number[]>;
}
