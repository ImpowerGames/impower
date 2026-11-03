import type { SaveValues } from "@impower/sparkdown/src/program/saveValueSet";
import type { StartingValueListing } from "@impower/sparkdown/src/program/startingValueLiterals";

export interface SaveSource {
  data: string;
  entry?: SaveValues;
  edits?: [string, string][];
}

export interface GameSave {
  data: string;
  scene: string;
  uri: string;
  line: number;
  entry?: SaveValues;
}

export interface SaveListed {
  listing: StartingValueListing;
  values: SaveValues;
  forms: Record<string, string>;
}
