import { ObservablePoint, Transform } from "pixi.js";
import { Mat4 } from "../math/mat4";
import { Matrix4x4 } from "./matrix";
import { Point3D } from "./point";
import { Quaternion } from "./quaternion";

/**
 * Handles position, scaling and rotation in 3D.
 */
export class Transform3D extends Transform {
  protected _observer = {
    _onUpdate: (point?: ObservablePoint) => {
      this._onUpdate(point);
      this._localID++;
    },
  };

  /** The position in local space. */
  override position = new Point3D(0, 0, 0, this._observer);

  /** The scale in local space. */
  override scale = new Point3D(1, 1, 1, this._observer);

  /** The rotation in local space. */
  rotationQuaternion = new Quaternion(0, 0, 0, 1, this._observer);

  /** The transformation matrix in world space. */
  worldTransform = new Matrix4x4();

  /** The transformation matrix in local space. */
  localTransform = new Matrix4x4();

  /** The inverse transformation matrix in world space. */
  inverseWorldTransform = new Matrix4x4();

  /** The normal transformation matrix. */
  normalTransform = new Matrix4x4();

  /** The world id */
  _worldID: number = 0;

  /** The local id */
  protected _localID: number = 0;

  /** The current local id */
  protected _currentLocalID: number = 0;

  /** The parent id */
  protected _parentID: number = 0;

  /**
   * Updates the local transformation matrix.
   */
  updateLocalTransform() {
    if (this._localID === this._currentLocalID) {
      return;
    }
    this.localTransform.setFromRotationPositionScale(
      this.rotationQuaternion,
      this.position,
      this.scale
    );

    // force an update.
    this._parentID = -1;
    this._currentLocalID = this._localID;
  }

  /**
   * Sets position, rotation and scale from a matrix array.
   * @param matrix The matrix to set.
   */
  override setFromMatrix(matrix: Matrix4x4) {
    this.localTransform.copyFrom(matrix);
    this.position.copyFrom(this.localTransform.position);
    this.scale.copyFrom(this.localTransform.scaling);
    this.rotationQuaternion.copyFrom(this.localTransform.rotation);
  }

  /**
   * Updates the world transformation matrix.
   * @param parentTransform The parent transform.
   */
  updateTransform(parentTransform?: Transform) {
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
      this.normalTransform.array
    );
    this._worldID++;
    if (parentTransform) {
      this._parentID = (parentTransform as Transform3D)._worldID;
    }
  }

  /**
   * Rotates the transform so the forward vector points at specified point.
   * @param point The point to look at.
   * @param up The upward direction.
   */
  lookAt(point: Point3D, up: Point3D | Float32Array = new Point3D(0, 1, 0)) {
    if (up instanceof Point3D) {
      up = up.array;
    }
    let rot = Mat4.getRotation(
      Mat4.targetTo(point.array, this.worldTransform.position.array, up)
    );
    this.rotationQuaternion.set(rot[0]!, rot[1], rot[2], rot[3]);
  }

  /**
   * Transforms a local point into world space.
   * @param point The point in local space.
   * @returns A new Point3D in world space.
   */
  localToWorld(point: Point3D, out: Point3D = new Point3D()): Point3D {
    Mat4.transformPoint(this.worldTransform.array, point.array, out.array);
    return out;
  }
}
