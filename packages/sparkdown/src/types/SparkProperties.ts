import { StructureItem } from "./StructureItem";

export interface SparkProperties {
  scenes?: {
    name: string;
    scene: string | number;
    line: number;
    dialogueDuration?: number;
    actionDuration?: number;
  }[];
  firstTokenLine?: number;
  characters?: Record<string, number[]>;
  locations?: Record<string, number[]>;
  times?: Record<string, number[]>;
  fontLine?: number;
  dialogueDuration?: number;
  actionDuration?: number;
  structure?: Record<string, StructureItem>;
}
