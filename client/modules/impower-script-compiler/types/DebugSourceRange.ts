import { DebugMetadata } from "../../impower-script-engine";

export interface DebugSourceRange {
  length: number;
  debugMetadata: DebugMetadata;
  text: string;
}
