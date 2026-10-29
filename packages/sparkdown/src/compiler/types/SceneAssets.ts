import type { ProgramAddress } from "./ProgramAddress";

export interface SceneBeat {
  address: ProgramAddress;
  image?: string[];
  audio?: string[];
  layouts?: string[];
  loads?: string[];
}

export interface SceneAssets {
  kind: "scene" | "function" | "root";
  beats: SceneBeat[];
  image: string[];
  audio: string[];
  layouts: string[];
  loads: string[];
  successors: string[];
  calls: string[];
  dynamic?: true;
  dynamicBases?: string[];
}

export interface SceneAssetCapture {
  beats: SceneBeat[];
  edges: Array<{ target: string; call: boolean }>;
  dynamic: boolean;
  dynamicBases: string[];
}

export const createSceneAssetCapture = (): SceneAssetCapture => ({
  beats: [],
  edges: [],
  dynamic: false,
  dynamicBases: [],
});
