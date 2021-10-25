import { Color, Activable } from "../../../../impower-core";

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

export const createDebugDisplayConfig = (
  obj?: Partial<DebugDisplayConfig>
): DebugDisplayConfig => ({
  bodyColor: {
    active: true,
    value: { h: 300, s: 1, l: 0.5, a: 1 },
  },
  staticBodyColor: {
    active: true,
    value: { h: 240, s: 1, l: 0.5, a: 1 },
  },
  velocityColor: {
    active: true,
    value: { h: 120, s: 1, l: 0.5, a: 1 },
  },
  ...obj,
});
