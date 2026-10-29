import { Container, type ContainerChild } from "pixi.js";

import { Matrix4x4 } from "./transform/matrix";
import { Point3D } from "./transform/point";
import { Quaternion } from "./transform/quaternion";
import { Transform3D } from "./transform/transform-3d";

export class Container3D extends Container implements ContainerChild {
  transform = new Transform3D();

  override get position(): Point3D {
    return this.transform.position;
  }
  override set position(value: Point3D) {
    this.transform.position.copyFrom(value);
  }

  override get scale(): Point3D {
    return this.transform.scale;
  }
  override set scale(value: Point3D) {
    this.transform.scale.copyFrom(value);
  }

  get rotationQuaternion(): Quaternion {
    return this.transform.rotationQuaternion;
  }
  set rotationQuaternion(value: Quaternion) {
    this.transform.rotationQuaternion.copyFrom(value);
  }

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
