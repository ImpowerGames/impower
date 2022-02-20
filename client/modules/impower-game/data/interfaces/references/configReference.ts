import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import { isReference, Reference } from "../reference";

export interface ConfigReference<T extends ConfigTypeId = ConfigTypeId>
  extends Reference<"Config"> {
  refType: "Config";
  refTypeId: T;
  refId: T;
}

export const isConfigReference = (obj: unknown): obj is ConfigReference => {
  if (!obj) {
    return false;
  }
  const configReference = obj as ConfigReference;
  return isReference(obj) && configReference.refType === "Config";
};

export const createConfigReference = <T extends ConfigTypeId = ConfigTypeId>(
  obj?: Partial<ConfigReference<T>> &
    Pick<ConfigReference<T>, "refTypeId" | "refId">
): ConfigReference<T> => ({
  refType: "Config",
  refTypeId: "",
  refId: "",
  ...obj,
});
