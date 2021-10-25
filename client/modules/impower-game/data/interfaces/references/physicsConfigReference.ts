import { ConfigTypeId } from "../../../project/classes/instances/config/configTypeId";
import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface PhysicsConfigReference
  extends ConfigReference<ConfigTypeId.PhysicsConfig> {
  refTypeId: ConfigTypeId.PhysicsConfig;
  refId: ConfigTypeId.PhysicsConfig;
}

export const isPhysicsConfigReference = (
  obj: unknown
): obj is PhysicsConfigReference => {
  if (!obj) {
    return false;
  }
  const physicsReference = obj as PhysicsConfigReference;
  return (
    isConfigReference(obj) &&
    physicsReference.refTypeId === ConfigTypeId.PhysicsConfig
  );
};

export const createPhysicsConfigReference = (
  obj?: Partial<PhysicsConfigReference>
): PhysicsConfigReference => ({
  ...createConfigReference({
    refTypeId: ConfigTypeId.PhysicsConfig,
    refId: ConfigTypeId.PhysicsConfig,
    ...obj,
  }),
  refTypeId: ConfigTypeId.PhysicsConfig,
  refId: ConfigTypeId.PhysicsConfig,
  ...obj,
});
