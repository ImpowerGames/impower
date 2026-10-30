/*
 * Based on pixi3d <https://github.com/jnsmalm/pixi3d>
 *
 * Copyright (c) 2023 Jens Malmborg
 * Released under the MIT license.
 */

import { ObservablePoint, type Observer, type PointData, type PointLike } from "pixi.js";
import { Vec3 } from "../math/vec3";
import { Matrix4x4 } from "./matrix";
import { Quaternion } from "./quaternion";

const temp = new Float32Array(3);

export class Point3D
  extends ObservablePoint
  implements IPoint3DData, PointData
{
  private _array = new Float32Array(3);

  get array() {
    return this._array;
  }

  set array(value: Float32Array) {
    this.setFrom(value);
  }

  get observer() {
    return (this as any)._observer as Observer<Point3D>;
  }

  constructor(x = 0, y = 0, z = 0, observer?: Observer<Point3D>) {
    super((observer as Observer<ObservablePoint>) || { _onUpdate: () => {} });
    this._array.set([x, y, z]);
  }

  override get x() {
    return this._array[0]!;
  }

  override set x(value: number) {
    if (this._array[0] !== value) {
      this._array[0] = value;
      this.observer._onUpdate(this);
    }
  }

  override get y() {
    return this._array[1]!;
  }

  override set y(value: number) {
    if (this._array[1] !== value) {
      this._array[1] = value;
      this.observer._onUpdate(this);
    }
  }

  get _z(): number {
    return this.z;
  }
  set _z(value) {
    this.z = value;
  }

  get z() {
    return this._array[2]!;
  }

  set z(value: number) {
    if (this._array[2] !== value) {
      this._array[2] = value;
      this.observer._onUpdate(this);
    }
  }

  override clone(observer?: Observer<ObservablePoint>): ObservablePoint {
    return new Point3D(this.x, this.y, this.z, observer);
  }

  override copyFrom(p: IPoint3DData) {
    if (
      this._array[0] !== p.x ||
      this._array[1] !== p.y ||
      this._array[2] !== p.z
    ) {
      this._array[0] = p.x;
      this._array[1] = p.y;
      this._array[2] = p.z;
      this.observer._onUpdate(this);
    }
    return this;
  }

  override copyTo<T extends PointLike>(p: T) {
    if (p instanceof Point3D) {
      p.set(this.x, this.y, this.z);
    }
    return <T>p;
  }

  override equals(p: Point3D): boolean {
    return p.x === this.x && p.y === this.y && p.z === this.z;
  }

  override set(x: number, y = x, z = x) {
    if (this._array[0] !== x || this._array[1] !== y || this._array[2] !== z) {
      this._array[0] = x;
      this._array[1] = y;
      this._array[2] = z;
      this.observer._onUpdate(this);
    }
    return this;
  }

  setFrom(array: ArrayLike<number>) {
    this.set(array[0]!, array[1], array[2]);
    return this;
  }

  override normalize<T extends PointData>(
    out: T = new Point3D() as unknown as T,
  ) {
    return (out as unknown as Point3D).setFrom(
      Vec3.normalize(this._array, temp),
    ) as unknown as T;
  }

  // @ts-expect-error
  override get magnitude() {
    return () => Vec3.magnitude(this._array);
  }

  static dot(a: Point3D, b: Point3D) {
    return Vec3.dot(a._array, b._array);
  }

  static add(a: Point3D, b: Point3D, out = new Point3D()) {
    return out.setFrom(Vec3.add(a._array, b._array, temp));
  }

  static subtract(a: Point3D, b: Point3D, out = new Point3D()) {
    return out.setFrom(Vec3.subtract(a._array, b._array, temp));
  }

  static cross(a: Point3D, b: Point3D, out = new Point3D()) {
    return out.setFrom(Vec3.cross(a._array, b._array, temp));
  }

  static inverse(a: Point3D, out = new Point3D()) {
    return out.setFrom(Vec3.inverse(a._array, temp));
  }

  static distance(a: Point3D, b: Point3D) {
    return Vec3.distance(a._array, b._array);
  }

  static squaredDistance(a: Point3D, b: Point3D) {
    return Vec3.squaredDistance(a._array, b._array);
  }

  static multiply(a: Point3D, b: Point3D, out = new Point3D()) {
    return out.setFrom(Vec3.multiply(a._array, b._array, temp));
  }

  static negate(a: Point3D, out = new Point3D()) {
    return out.setFrom(Vec3.negate(a._array, temp));
  }

  static transform(a: Point3D, m: Matrix4x4 | Quaternion, out = new Point3D()) {
    if (m instanceof Matrix4x4) {
      return out.setFrom(Vec3.transformMat4(a._array, m.array, temp));
    }
    return out.setFrom(Vec3.transformQuat(a._array, m.array, temp));
  }

  static lerp(a: Point3D, b: Point3D, t: number, out = new Point3D()) {
    return out.setFrom(Vec3.lerp(a._array, b._array, t, temp));
  }

  static scale(a: Point3D, b: number, out = new Point3D()) {
    return out.setFrom(Vec3.scale(a._array, b, temp));
  }
}

export interface IPoint3DData {
  x: number;
  y: number;
  z: number;
}
