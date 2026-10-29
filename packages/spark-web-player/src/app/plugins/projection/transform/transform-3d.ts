import { ObservablePoint, Transform } from "pixi.js";
import { Mat4 } from "../math/mat4";
import { Matrix4x4 } from "./matrix";
import { Point3D } from "./point";
import { Quaternion } from "./quaternion";

export class Transform3D extends Transform {
  protected _observer = {
    _onUpdate: (point?: ObservablePoint) => {
      this._onUpdate(point);
      this._localID++;
    },
  };

  override position = new Point3D(0, 0, 0, this._observer);

  override scale = new Point3D(1, 1, 1, this._observer);

  // @ts-ignore - override number rotation with quaternion rotation
  override get rotation(): Quaternion {
    return this.rotationQuaternion;
  }

  rotationQuaternion = new Quaternion(0, 0, 0, 1, this._observer);

  worldTransform = new Matrix4x4();

  localTransform = new Matrix4x4();

  inverseWorldTransform = new Matrix4x4();

  normalTransform = new Matrix4x4();

  _worldID: number = 0;

  protected _localID: number = 0;

  protected _currentLocalID: number = 0;

  protected _parentID: number = 0;

  updateLocalTransform() {
    if (this._localID === this._currentLocalID) {
      return;
    }
    this.localTransform.setFromRotationPositionScale(
      this.rotationQuaternion,
      this.position,
      this.scale,
    );

    this._parentID = -1;
    this._currentLocalID = this._localID;
  }

  override setFromMatrix(matrix: Matrix4x4) {
    this.localTransform.copyFrom(matrix);
    this.position.copyFrom(this.localTransform.position);
    this.scale.copyFrom(this.localTransform.scaling);
    this.rotationQuaternion.copyFrom(this.localTransform.rotation);
  }

  updateTransform(parentTransform?: Transform3D) {
    this.updateLocalTransform();
    if (
      parentTransform &&
      this._parentID === (parentTransform as Transform3D)._worldID
    ) {
      return;
    }
    this.worldTransform.copyFrom(this.localTransform);
    if (parentTransform instanceof Transform3D) {
      this.worldTransform.multiply(parentTransform.worldTransform);
    }
    Mat4.invert(this.worldTransform.array, this.inverseWorldTransform.array);
    Mat4.transpose(
      this.inverseWorldTransform.array,
      this.normalTransform.array,
    );
    this._worldID++;
    if (parentTransform) {
      this._parentID = (parentTransform as Transform3D)._worldID;
    }
  }

  lookAt(point: Point3D, up: Point3D | Float32Array = new Point3D(0, 1, 0)) {
    if (up instanceof Point3D) {
      up = up.array;
    }
    let rot = Mat4.getRotation(
      Mat4.targetTo(point.array, this.worldTransform.position.array, up),
    );
    this.rotationQuaternion.set(rot[0]!, rot[1], rot[2], rot[3]);
  }

  localToWorld(point: Point3D, out: Point3D = new Point3D()): Point3D {
    Mat4.transformPoint(this.worldTransform.array, point.array, out.array);
    return out;
  }
}
