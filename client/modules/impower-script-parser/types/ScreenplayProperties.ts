export interface ScreenplayProperties {
  scenes?: {
    name: string;
    scene: string | number;
    line: number;
  }[];
  firstTokenLine?: number;
  characters?: Record<string, number[]>;
  locations?: Record<string, number[]>;
  times?: Record<string, number[]>;
}
