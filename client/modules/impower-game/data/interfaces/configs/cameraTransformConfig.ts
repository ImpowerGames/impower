export interface CameraTransformConfig {
  /**
   * The rotation of the Camera, in radians.
   */
  rotation: number;
  /**
   * The default zoom level of the Camera.
   */
  zoom: number;
}

export const createCameraTransformConfig = (
  obj?: Partial<CameraTransformConfig>
): CameraTransformConfig => ({
  rotation: 0,
  zoom: 1,
  ...obj,
});
