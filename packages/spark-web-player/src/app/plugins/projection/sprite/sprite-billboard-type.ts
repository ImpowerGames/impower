/**
 * Represents different billboard types.
 */
export enum SpriteBillboardType {
  /**
   * Sprite will be rotated towards the camera on both the x-plane and y-plane.
   */
  spherical = "spherical",
  /**
   * Sprite will be rotated towards the camera on the y-plane.
   */
  cylindrical = "cylindrical",
  /**
   * Sprite will not be rotated towards the camera.
   */
  none = "none",
}
