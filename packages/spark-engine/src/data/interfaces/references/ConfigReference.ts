import { ConfigTypeId } from "../../../project/classes/instances/config/ConfigTypeId";
import { Reference } from "../Reference";

export interface ConfigReference<T extends ConfigTypeId = ConfigTypeId>
  extends Reference<"Config"> {
  refType: "Config";
  refTypeId: T | "";
  refId: T | "";
}
