import { ConfigReference } from "../../../../data/interfaces/references/ConfigReference";
import { InstanceData } from "../../instance/InstanceData";
import { ConfigTypeId } from "./ConfigTypeId";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigData<T extends ConfigTypeId = ConfigTypeId>
  extends InstanceData<"Config", ConfigReference<T>> {}
