import {
  ConfigReference,
  isConfigReference,
} from "../../../../data/interfaces/references/configReference";
import { createInstanceData, InstanceData } from "../../instance/instanceData";
import { ConfigTypeId } from "./configTypeId";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigData<T extends ConfigTypeId = ConfigTypeId>
  extends InstanceData<"Config", ConfigReference<T>> {}

export const isConfigData = <T extends ConfigTypeId = ConfigTypeId>(
  obj: unknown
): obj is ConfigData<T> => {
  if (!obj) {
    return false;
  }
  const configData = obj as ConfigData<T>;
  return isConfigReference(configData.reference);
};

export const createConfigData = <T extends ConfigTypeId = ConfigTypeId>(
  obj?: Partial<ConfigData<T>> & Pick<ConfigData<T>, "reference">
): ConfigData<T> => ({
  ...createInstanceData<"Config", ConfigReference<T>>({
    reference: obj?.reference,
  }),
  ...obj,
});
