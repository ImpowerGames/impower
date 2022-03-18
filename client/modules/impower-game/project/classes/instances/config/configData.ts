import { ConfigReference } from "../../../../data/interfaces/references/configReference";
import { InstanceData } from "../../instance/instanceData";
import { ConfigTypeId } from "./configTypeId";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigData<T extends ConfigTypeId = ConfigTypeId>
  extends InstanceData<"Config", ConfigReference<T>> {}
