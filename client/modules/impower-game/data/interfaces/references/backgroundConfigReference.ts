import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface BackgroundConfigReference
  extends ConfigReference<"BackgroundConfig"> {
  refTypeId: "BackgroundConfig";
  refId: "BackgroundConfig";
}

export const isBackgroundConfigReference = (
  obj: unknown
): obj is BackgroundConfigReference => {
  if (!obj) {
    return false;
  }
  const backgroundReference = obj as BackgroundConfigReference;
  return (
    isConfigReference(obj) &&
    backgroundReference.refTypeId === "BackgroundConfig"
  );
};

export const createBackgroundConfigReference = (
  obj?: Partial<BackgroundConfigReference>
): BackgroundConfigReference => ({
  ...createConfigReference({
    refTypeId: "BackgroundConfig",
    refId: "BackgroundConfig",
    ...obj,
  }),
  refTypeId: "BackgroundConfig",
  refId: "BackgroundConfig",
  ...obj,
});
