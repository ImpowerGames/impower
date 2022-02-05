import { DebugMetadata } from "../../impower-script-engine";

export const DONE_IDENTIFIER: Identifier = {
  name: "DONE",
  debugMetadata: null,
};

export interface Identifier {
  name: string;
  debugMetadata: DebugMetadata;
}
