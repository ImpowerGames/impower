import { Activable, Vector2 } from "../../../../../../impower-core";
import { Bounds } from "../../../../../data/interfaces/bounds";
import { CollisionBiasesConfig } from "../../../../../data/interfaces/configs/collisionBiasesConfig";
import { CollisionCheckConfig } from "../../../../../data/interfaces/configs/collisionCheckConfig";
import { DebugDisplayConfig } from "../../../../../data/interfaces/configs/debugDisplayConfig";
import { DynamicBodiesTreeConfig } from "../../../../../data/interfaces/configs/dynamicBodiesTreeConfig";
import { TimeConfig } from "../../../../../data/interfaces/configs/timeConfig";
import { ConfigData } from "../../config/configData";

export interface PhysicsConfigData extends ConfigData {
  /**
   * Time settings
   */
  time: TimeConfig;
  /**
   * Acceleration of Bodies due to gravity, in pixels per second.
   */
  gravity: Vector2;
  /**
   * The World boundary is an invisible rectangle that defines the edges of the World.
   * If a Body is set to collide with the world bounds then it will automatically stop when it reaches any of the edges.
   * You can optionally set which edges of the boundary should be checked against.
   */
  collisionBounds: Activable<Bounds>;
  /**
   * Should check collision on which bounds edge?
   */
  checkCollision: CollisionCheckConfig;
  /**
   * The maximum absolute difference of a Body's per-step velocity
   * and its overlap with another Body or tile that will result in separation on each axis.
   * Larger values favor separation. Smaller values favor no separation.
   */
  collisionBiases: CollisionBiasesConfig;
  /**
   * Debug display settings
   */
  debugDisplay: Activable<DebugDisplayConfig>;
  /**
   * An RTree is a fast way of spatially sorting of all the bodies in the world.
   * However, at certain limits, the cost of clearing and inserting the bodies into the
   * tree every frame becomes more expensive than the search speed gains it provides.
   *
   * If you have a large number of dynamic bodies in your world then it may be best to
   * disable the use of the RTree by setting this property to false in the physics config.
   *
   * The number it can cope with depends on browser and device, but a conservative estimate
   * of around 5,000 bodies should be considered the max before disabling it.
   *
   * This only applies to dynamic bodies. Static bodies are always kept in an RTree,
   * because they don't have to be cleared every frame,
   * so you benefit from the massive search speeds all the time.
   */
  dynamicBodiesTree: Activable<DynamicBodiesTreeConfig>;
}
