import { isConfigReference } from "../../../../data/utils/isConfigReference";
import { ConfigData } from "./configData";
import { ConfigTypeId } from "./configTypeId";

export const isConfigData = <T extends ConfigTypeId = ConfigTypeId>(
  obj: unknown
): obj is ConfigData<T> => {
  if (!obj) {
    return false;
  }
  const configData = obj as ConfigData<T>;
  return isConfigReference(configData.reference);
};
