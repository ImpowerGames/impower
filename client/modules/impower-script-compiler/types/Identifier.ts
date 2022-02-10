import { DebugMetadata } from "../../impower-script-engine";

export const DONE_IDENTIFIER: Identifier = {
  name: "DONE",
  debugMetadata: null,
};

export interface Identifier {
  name: string;
  debugMetadata: DebugMetadata;
}

export const isIdentifier = (obj: unknown): obj is Identifier => {
  if (!obj) {
    return false;
  }
  const castObj = obj as Identifier;
  return castObj.name !== undefined && castObj.debugMetadata !== undefined;
};
