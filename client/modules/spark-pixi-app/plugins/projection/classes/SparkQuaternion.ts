import { Quaternion } from "pixi3d/pixi7";

export class SparkQuaternion extends Quaternion {
  /**
   * Sets the euler angles in degrees.
   * @param x The x angle.
   * @param y The y angle.
   * @param z The z angle.
   */
  override setEulerAngles(x: number, y: number, z: number): this {
    super.setEulerAngles(x, y, z);
    return this;
  }
}
