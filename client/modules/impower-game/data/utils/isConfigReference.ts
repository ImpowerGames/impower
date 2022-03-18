import { ConfigReference } from "../interfaces/references/configReference";
import { isReference } from "./isReference";

export const isConfigReference = (obj: unknown): obj is ConfigReference => {
  if (!obj) {
    return false;
  }
  const configReference = obj as ConfigReference;
  return isReference(obj) && configReference.refType === "Config";
};
