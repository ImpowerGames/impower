import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface DebugConfigReference
  extends ConfigReference<ConfigTypeId.DebugConfig> {
  refTypeId: ConfigTypeId.DebugConfig;
  refId: ConfigTypeId.DebugConfig;
}

export const isDebugConfigReference = (
  obj: unknown
): obj is DebugConfigReference => {
  if (!obj) {
    return false;
  }
  const debugReference = obj as DebugConfigReference;
  return (
    isConfigReference(obj) &&
    debugReference.refTypeId === ConfigTypeId.DebugConfig
  );
};

export const createDebugConfigReference = (
  obj?: Partial<DebugConfigReference>
): DebugConfigReference => ({
  ...createConfigReference({
    refTypeId: ConfigTypeId.DebugConfig,
    refId: ConfigTypeId.DebugConfig,
    ...obj,
  }),
  refTypeId: ConfigTypeId.DebugConfig,
  refId: ConfigTypeId.DebugConfig,
  ...obj,
});
