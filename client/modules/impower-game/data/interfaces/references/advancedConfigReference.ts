import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface AdvancedConfigReference
  extends ConfigReference<"AdvancedConfig"> {
  refTypeId: "AdvancedConfig";
  refId: "AdvancedConfig";
}

export const isAdvancedConfigReference = (
  obj: unknown
): obj is AdvancedConfigReference => {
  if (!obj) {
    return false;
  }
  const logicReference = obj as AdvancedConfigReference;
  return (
    isConfigReference(obj) && logicReference.refTypeId === "AdvancedConfig"
  );
};

export const createAdvancedConfigReference = (
  obj?: Partial<AdvancedConfigReference>
): AdvancedConfigReference => ({
  ...createConfigReference({
    refTypeId: "AdvancedConfig",
    refId: "AdvancedConfig",
    ...obj,
  }),
  refTypeId: "AdvancedConfig",
  refId: "AdvancedConfig",
  ...obj,
});
