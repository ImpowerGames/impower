export interface CollisionCheckConfig {
  /**
   * Will bodies collide with the top side of the world bounds?
   */
  up: boolean;
  /**
   * Will bodies collide with the bottom side of the world bounds?
   */
  down: boolean;
  /**
   * Will bodies collide with the left side of the world bounds?
   */
  left: boolean;
  /**
   * Will bodies collide with the right side of the world bounds?
   */
  right: boolean;
}
