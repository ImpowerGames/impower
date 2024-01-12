import { ConfigReference } from "../../../data/interfaces/references/ConfigReference";
import { ConfigTypeId } from "./ConfigTypeId";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigData<T extends ConfigTypeId = ConfigTypeId> {
  reference: ConfigReference<T>;
}
