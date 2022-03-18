import { ConfigTypeId } from "../../project/classes/instances/config/configTypeId";
import { ConfigReference } from "../interfaces/references/configReference";

export const createConfigReference = <T extends ConfigTypeId = ConfigTypeId>(
  obj?: Partial<ConfigReference<T>> &
    Pick<ConfigReference<T>, "refTypeId" | "refId">
): ConfigReference<T> => ({
  refType: "Config",
  refTypeId: "",
  refId: "",
  ...obj,
});
