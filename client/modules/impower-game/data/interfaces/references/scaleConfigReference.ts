import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface ScaleConfigReference extends ConfigReference<"ScaleConfig"> {
  refTypeId: "ScaleConfig";
  refId: "ScaleConfig";
}

export const isScaleConfigReference = (
  obj: unknown
): obj is ScaleConfigReference => {
  if (!obj) {
    return false;
  }
  const scaleReference = obj as ScaleConfigReference;
  return isConfigReference(obj) && scaleReference.refTypeId === "ScaleConfig";
};

export const createScaleConfigReference = (
  obj?: Partial<ScaleConfigReference>
): ScaleConfigReference => ({
  ...createConfigReference({
    refTypeId: "ScaleConfig",
    refId: "ScaleConfig",
    ...obj,
  }),
  refTypeId: "ScaleConfig",
  refId: "ScaleConfig",
  ...obj,
});
