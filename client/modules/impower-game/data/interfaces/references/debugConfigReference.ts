import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface DebugConfigReference extends ConfigReference<"DebugConfig"> {
  refTypeId: "DebugConfig";
  refId: "DebugConfig";
}

export const isDebugConfigReference = (
  obj: unknown
): obj is DebugConfigReference => {
  if (!obj) {
    return false;
  }
  const debugReference = obj as DebugConfigReference;
  return isConfigReference(obj) && debugReference.refTypeId === "DebugConfig";
};

export const createDebugConfigReference = (
  obj?: Partial<DebugConfigReference>
): DebugConfigReference => ({
  ...createConfigReference({
    refTypeId: "DebugConfig",
    refId: "DebugConfig",
    ...obj,
  }),
  refTypeId: "DebugConfig",
  refId: "DebugConfig",
  ...obj,
});
