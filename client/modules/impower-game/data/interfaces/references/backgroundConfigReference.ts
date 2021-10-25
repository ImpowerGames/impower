import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface BackgroundConfigReference
  extends ConfigReference<ConfigTypeId.BackgroundConfig> {
  refTypeId: ConfigTypeId.BackgroundConfig;
  refId: ConfigTypeId.BackgroundConfig;
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
    backgroundReference.refTypeId === ConfigTypeId.BackgroundConfig
  );
};

export const createBackgroundConfigReference = (
  obj?: Partial<BackgroundConfigReference>
): BackgroundConfigReference => ({
  ...createConfigReference({
    refTypeId: ConfigTypeId.BackgroundConfig,
    refId: ConfigTypeId.BackgroundConfig,
    ...obj,
  }),
  refTypeId: ConfigTypeId.BackgroundConfig,
  refId: ConfigTypeId.BackgroundConfig,
  ...obj,
});
