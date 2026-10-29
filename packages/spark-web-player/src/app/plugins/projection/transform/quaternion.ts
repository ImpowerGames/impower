import { ObservablePoint, type Observer, type PointData, type PointLike } from "pixi.js";
import { Quat } from "../math/quat";

const temp = new Float32Array(4);

export class Quaternion extends ObservablePoint implements PointData {
  private _array = new Float32Array(4);

  get array() {
    return this._array;
  }

  set array(value: Float32Array) {
    this.setFrom(value);
  }

  get observer() {
    return (this as any)._observer as Observer<ObservablePoint>;
  }

  constructor(
    x = 0,
    y = 0,
    z = 0,
    w = 1,
    observer?: Observer<ObservablePoint>,
  ) {
    super(observer || { _onUpdate: () => {} });
    this._array.set([x, y, z, w]);
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

  get z() {
    return this._array[2]!;
  }

  set z(value: number) {
    if (this._array[2] !== value) {
      this._array[2] = value;
      this.observer._onUpdate(this);
    }
  }

  get w() {
    return this._array[3]!;
  }

  set w(value: number) {
    if (this._array[3] !== value) {
      this._array[3] = value;
      this.observer._onUpdate(this);
    }
  }

  setAngles(x: number, y: number, z: number) {
    Quat.fromEuler(x, y, z, this._array);
    this.observer._onUpdate(this);
  }

  override clone(observer?: Observer<ObservablePoint>): ObservablePoint {
    return new Quaternion(this.x, this.y, this.z, this.w, observer);
  }

  override copyFrom(p: Quaternion) {
    if (
      this._array[0] !== p.x ||
      this._array[1] !== p.y ||
      this._array[2] !== p.z ||
      this._array[3] !== p.w
    ) {
      this._array[0] = p.x;
      this._array[1] = p.y;
      this._array[2] = p.z;
      this._array[3] = p.w;
      this.observer._onUpdate(this);
    }
    return this;
  }

  override copyTo<T extends PointLike>(p: T) {
    if (p instanceof Quaternion) {
      p.set(this.x, this.y, this.z, this.w);
    }
    return <T>p;
  }

  override equals(p: Quaternion) {
    return p.x === this.x && p.y === this.y && p.z === this.z && p.w === this.w;
  }

  override set(x: number, y = x, z = x, w = x) {
    if (
      this._array[0] !== x ||
      this._array[1] !== y ||
      this._array[2] !== z ||
      this._array[3] !== w
    ) {
      this._array[0] = x;
      this._array[1] = y;
      this._array[2] = z;
      this._array[3] = w;
      this.observer._onUpdate(this);
    }
    return this;
  }

  setFrom(array: ArrayLike<number>) {
    this.set(array[0]!, array[1], array[2], array[3]);
    return this;
  }

  override normalize<T extends PointData>(
    out: T = new Quaternion() as unknown as T,
  ) {
    return (out as unknown as Quaternion).setFrom(
      Quat.normalize(this._array, temp),
    ) as unknown as T;
  }

  static slerp(
    a: Quaternion,
    b: Quaternion,
    t: number,
    out = new Quaternion(),
  ) {
    return out.setFrom(Quat.slerp(a.array, b.array, t, temp));
  }

  static fromEuler(x: number, y: number, z: number, out = new Quaternion()) {
    return out.setFrom(Quat.fromEuler(x, y, z, temp));
  }

  static conjugate(a: Quaternion, out = new Quaternion()) {
    return out.setFrom(Quat.conjugate(a.array, temp));
  }

  static rotateX(a: Quaternion, rad: number, out = new Quaternion()) {
    return out.setFrom(Quat.rotateX(a.array, rad, temp));
  }

  static rotateY(a: Quaternion, rad: number, out = new Quaternion()) {
    return out.setFrom(Quat.rotateY(a.array, rad, temp));
  }

  static rotateZ(a: Quaternion, rad: number, out = new Quaternion()) {
    return out.setFrom(Quat.rotateZ(a.array, rad, temp));
  }
}
