import {
  ConfigReference,
  createConfigReference,
  isConfigReference,
} from "./configReference";

export interface PhysicsConfigReference
  extends ConfigReference<"PhysicsConfig"> {
  refTypeId: "PhysicsConfig";
  refId: "PhysicsConfig";
}

export const isPhysicsConfigReference = (
  obj: unknown
): obj is PhysicsConfigReference => {
  if (!obj) {
    return false;
  }
  const physicsReference = obj as PhysicsConfigReference;
  return (
    isConfigReference(obj) && physicsReference.refTypeId === "PhysicsConfig"
  );
};

export const createPhysicsConfigReference = (
  obj?: Partial<PhysicsConfigReference>
): PhysicsConfigReference => ({
  ...createConfigReference({
    refTypeId: "PhysicsConfig",
    refId: "PhysicsConfig",
    ...obj,
  }),
  refTypeId: "PhysicsConfig",
  refId: "PhysicsConfig",
  ...obj,
});
