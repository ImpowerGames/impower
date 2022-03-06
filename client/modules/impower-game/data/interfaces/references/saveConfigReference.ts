import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface SaveConfigReference extends ConfigReference<"SaveConfig"> {
  refTypeId: "SaveConfig";
  refId: "SaveConfig";
}

export const isSaveConfigReference = (
  obj: unknown
): obj is SaveConfigReference => {
  if (!obj) {
    return false;
  }
  const saveReference = obj as SaveConfigReference;
  return isConfigReference(obj) && saveReference.refTypeId === "SaveConfig";
};

export const createSaveConfigReference = (
  obj?: Partial<SaveConfigReference>
): SaveConfigReference => ({
  ...createConfigReference({
    refTypeId: "SaveConfig",
    refId: "SaveConfig",
    ...obj,
  }),
  refTypeId: "SaveConfig",
  refId: "SaveConfig",
  ...obj,
});
