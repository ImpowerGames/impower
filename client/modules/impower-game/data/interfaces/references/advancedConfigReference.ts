import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface AdvancedConfigReference
  extends ConfigReference<ConfigTypeId.AdvancedConfig> {
  refTypeId: ConfigTypeId.AdvancedConfig;
  refId: ConfigTypeId.AdvancedConfig;
}

export const isAdvancedConfigReference = (
  obj: unknown
): obj is AdvancedConfigReference => {
  if (!obj) {
    return false;
  }
  const logicReference = obj as AdvancedConfigReference;
  return (
    isConfigReference(obj) &&
    logicReference.refTypeId === ConfigTypeId.AdvancedConfig
  );
};

export const createAdvancedConfigReference = (
  obj?: Partial<AdvancedConfigReference>
): AdvancedConfigReference => ({
  ...createConfigReference({
    refTypeId: ConfigTypeId.AdvancedConfig,
    refId: ConfigTypeId.AdvancedConfig,
    ...obj,
  }),
  refTypeId: ConfigTypeId.AdvancedConfig,
  refId: ConfigTypeId.AdvancedConfig,
  ...obj,
});
