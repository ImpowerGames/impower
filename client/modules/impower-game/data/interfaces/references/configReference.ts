import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import { Reference } from "../reference";

export interface ConfigReference<T extends ConfigTypeId = ConfigTypeId>
  extends Reference<"Config"> {
  refType: "Config";
  refTypeId: T;
  refId: T;
}
