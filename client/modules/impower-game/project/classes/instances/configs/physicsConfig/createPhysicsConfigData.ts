import { createBounds } from "../../../../../data/interfaces/bounds";
import { createCollisionBiasesConfig } from "../../../../../data/interfaces/configs/collisionBiasesConfig";
import { createCollisionCheckConfig } from "../../../../../data/interfaces/configs/collisionCheckConfig";
import { createDebugDisplayConfig } from "../../../../../data/interfaces/configs/debugDisplayConfig";
import { createDynamicBodiesTreeConfig } from "../../../../../data/interfaces/configs/dynamicBodiesTreeConfig";
import { createTimeConfig } from "../../../../../data/interfaces/configs/timeConfig";
import { createConfigReference } from "../../../../../data/utils/createConfigReference";
import { createConfigData } from "../../config/createConfigData";
import { PhysicsConfigData } from "./physicsConfigData";

export const createPhysicsConfigData = (
  obj?: Partial<PhysicsConfigData>
): PhysicsConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "PhysicsConfig",
      refId: "PhysicsConfig",
    }),
  }),
  time: createTimeConfig(),
  gravity: { x: 0, y: 0 },
  collisionBounds: { active: false, value: createBounds() },
  checkCollision: createCollisionCheckConfig(),
  collisionBiases: createCollisionBiasesConfig(),
  debugDisplay: { active: false, value: createDebugDisplayConfig() },
  dynamicBodiesTree: { active: true, value: createDynamicBodiesTreeConfig() },
  ...obj,
});
