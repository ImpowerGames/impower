import { Activable } from "../Activable";
import { Color } from "../Color";

export interface DebugDisplayConfig {
  /**
   * The color of dynamic body outlines when rendered to the debug display.
   */
  bodyColor: Activable<Color>;
  /**
   * The color of static body outlines when rendered to the debug display.
   */
  staticBodyColor: Activable<Color>;
  /**
   * The color of the velocity markers when rendered to the debug display.
   */
  velocityColor: Activable<Color>;
}
