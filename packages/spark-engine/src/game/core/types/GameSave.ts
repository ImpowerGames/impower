import type { SaveValues } from "@impower/sparkdown/src/program/saveValueSet";

export interface GameSave {
  data: string;
  scene: string;
  uri: string;
  line: number;
  values: SaveValues;
}
