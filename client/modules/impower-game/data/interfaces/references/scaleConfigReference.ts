import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface ScaleConfigReference
  extends ConfigReference<ConfigTypeId.ScaleConfig> {
  refTypeId: ConfigTypeId.ScaleConfig;
  refId: ConfigTypeId.ScaleConfig;
}

export const isScaleConfigReference = (
  obj: unknown
): obj is ScaleConfigReference => {
  if (!obj) {
    return false;
  }
  const scaleReference = obj as ScaleConfigReference;
  return (
    isConfigReference(obj) &&
    scaleReference.refTypeId === ConfigTypeId.ScaleConfig
  );
};

export const createScaleConfigReference = (
  obj?: Partial<ScaleConfigReference>
): ScaleConfigReference => ({
  ...createConfigReference({
    refTypeId: ConfigTypeId.ScaleConfig,
    refId: ConfigTypeId.ScaleConfig,
    ...obj,
  }),
  refTypeId: ConfigTypeId.ScaleConfig,
  refId: ConfigTypeId.ScaleConfig,
  ...obj,
});
