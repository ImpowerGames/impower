import { Container, ContainerChild } from "pixi.js";

import { Matrix4x4 } from "./transform/matrix";
import { Point3D } from "./transform/point";
import { Quaternion } from "./transform/quaternion";
import { Transform3D } from "./transform/transform";

/**
 * A container represents a collection of 3D objects.
 */
export class Container3D extends Container implements ContainerChild {
  /**
   * The transform in 3D space.
   */
  transform = new Transform3D();

  /**
   * The position in local 3D space.
   */
  override get position(): Point3D {
    return this.transform.position;
  }
  override set position(value: Point3D) {
    this.transform.position.copyFrom(value);
  }

  /**
   * The scale in local 3D space.
   */
  override get scale(): Point3D {
    return this.transform.scale;
  }
  override set scale(value: Point3D) {
    this.transform.scale.copyFrom(value);
  }

  /**
   * The rotation in local 3D space.
   */
  get rotationQuaternion(): Quaternion {
    return this.transform.rotationQuaternion;
  }
  set rotationQuaternion(value: Quaternion) {
    this.transform.rotationQuaternion.copyFrom(value);
  }

  /** The local position of the object on the z axis in 3d space. */
  get z() {
    return this.transform.position.z;
  }
  set z(value: number) {
    this.transform.position.z = value;
  }

  private _localTransform = new Matrix4x4();
  // @ts-expect-error
  override get localTransform() {
    if (this.transform) {
      return this.transform.localTransform;
    } else {
      return this._localTransform;
    }
  }
  override set localTransform(value: Matrix4x4) {
    if (this.transform) {
      this.transform.localTransform = value;
    } else {
      this._localTransform = value;
    }
  }

  override get worldTransform() {
    return this.transform.worldTransform;
  }
}
