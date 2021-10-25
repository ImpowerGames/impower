import { isReference, Reference } from "../reference";
import { ConfigType } from "../../enums/data";
import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";

export interface ConfigReference<T extends ConfigTypeId = ConfigTypeId>
  extends Reference<ConfigType.Config> {
  refType: ConfigType.Config;
  refTypeId: T;
  refId: T;
}

export const isConfigReference = (obj: unknown): obj is ConfigReference => {
  if (!obj) {
    return false;
  }
  const configReference = obj as ConfigReference;
  return isReference(obj) && configReference.refType === ConfigType.Config;
};

export const createConfigReference = <T extends ConfigTypeId = ConfigTypeId>(
  obj?: Partial<ConfigReference<T>> &
    Pick<ConfigReference<T>, "refTypeId" | "refId">
): ConfigReference<T> => ({
  refType: ConfigType.Config,
  refTypeId: "",
  refId: "",
  ...obj,
});
