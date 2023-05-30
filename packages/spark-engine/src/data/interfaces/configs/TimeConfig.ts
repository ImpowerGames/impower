export interface TimeConfig {
  /**
   * The number of physics steps to be taken per second.
   */
  fps: number;
  /**
   * Scaling factor applied to the frame rate.
   *
   * 1.0 = normal speed
   * 2.0 = half speed
   * 0.5 = double speed
   */
  timeScale: number;
}
