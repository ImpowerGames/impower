import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface SaveConfigReference
  extends ConfigReference<ConfigTypeId.SaveConfig> {
  refTypeId: ConfigTypeId.SaveConfig;
  refId: ConfigTypeId.SaveConfig;
}

export const isSaveConfigReference = (
  obj: unknown
): obj is SaveConfigReference => {
  if (!obj) {
    return false;
  }
  const saveReference = obj as SaveConfigReference;
  return (
    isConfigReference(obj) &&
    saveReference.refTypeId === ConfigTypeId.SaveConfig
  );
};

export const createSaveConfigReference = (
  obj?: Partial<SaveConfigReference>
): SaveConfigReference => ({
  ...createConfigReference({
    refTypeId: ConfigTypeId.SaveConfig,
    refId: ConfigTypeId.SaveConfig,
    ...obj,
  }),
  refTypeId: ConfigTypeId.SaveConfig,
  refId: ConfigTypeId.SaveConfig,
  ...obj,
});
