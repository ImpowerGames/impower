import { ConfigReference } from "../../../../data/interfaces/references/configReference";
import { createInstanceData } from "../../instance/createInstanceData";
import { ConfigData } from "./configData";
import { ConfigTypeId } from "./configTypeId";

export const createConfigData = <T extends ConfigTypeId = ConfigTypeId>(
  obj?: Partial<ConfigData<T>> & Pick<ConfigData<T>, "reference">
): ConfigData<T> => ({
  ...createInstanceData<"Config", ConfigReference<T>>({
    reference: obj?.reference,
  }),
  ...obj,
});
