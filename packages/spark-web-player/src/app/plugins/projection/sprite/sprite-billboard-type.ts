/**
 * Represents different billboard types.
 */
export type SpriteBillboardType =
  /**
   * Sprite will be rotated towards the camera on both the x-plane and y-plane.
   */
  | "spherical"
  /**
   * Sprite will be rotated towards the camera on the y-plane.
   */
  | "cylindrical"
  /**
   * Sprite will not be rotated towards the camera.
   */
  | "none";
