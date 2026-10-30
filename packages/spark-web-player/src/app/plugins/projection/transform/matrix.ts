/*
 * Based on pixi3d <https://github.com/jnsmalm/pixi3d>
 *
 * Copyright (c) 2023 Jens Malmborg
 * Released under the MIT license.
 */

import { Matrix } from "pixi.js";
import { Mat4 } from "../math/mat4";
import { Quat } from "../math/quat";
import { Vec3 } from "../math/vec3";
import { MatrixComponent } from "./matrix-component";
import { Point3D } from "./point";
import { Quaternion } from "./quaternion";
import type { TransformId } from "./transform-id";

const temp = new Float32Array(16);

export class Matrix4x4 extends Matrix implements TransformId {
  private _transformId = 0;
  private _position?: MatrixComponent<Point3D>;
  private _scaling?: MatrixComponent<Point3D>;
  private _rotation?: MatrixComponent<Quaternion>;
  private _up?: MatrixComponent<Point3D>;
  private _down?: MatrixComponent<Point3D>;
  private _forward?: MatrixComponent<Point3D>;
  private _left?: MatrixComponent<Point3D>;
  private _right?: MatrixComponent<Point3D>;
  private _backward?: MatrixComponent<Point3D>;

  get transformId() {
    return this._transformId;
  }

  public override array: Float32Array<ArrayBuffer>;

  constructor(array?: ArrayLike<number>) {
    super();
    if (array) {
      this.array = new Float32Array(array);
    } else {
      this.array = new Float32Array([
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      ]);
    }
  }

  override toArray(transpose: boolean, out?: Float32Array<ArrayBuffer>) {
    if (transpose) {
      return Mat4.transpose(this.array, out);
    }
    return out ? Mat4.copy(this.array, out) : this.array;
  }

  get position() {
    if (!this._position) {
      this._position = new MatrixComponent<Point3D>(
        this,
        new Point3D(),
        (data) => {
          Mat4.getTranslation(
            this.array,
            data.array as Float32Array<ArrayBuffer>,
          );
        },
      );
    }
    return this._position.data;
  }

  get scaling() {
    if (!this._scaling) {
      this._scaling = new MatrixComponent<Point3D>(
        this,
        new Point3D(),
        (data) => {
          Mat4.getScaling(this.array, data.array as Float32Array<ArrayBuffer>);
        },
      );
    }
    return this._scaling.data;
  }

  get rotation() {
    if (!this._rotation) {
      let matrix = new Float32Array(16);
      this._rotation = new MatrixComponent<Quaternion>(
        this,
        new Quaternion(),
        (data) => {
          for (let col = 0; col < 3; col++) {
            matrix[col + 0] = this.array[col + 0]! / this.scaling.x;
            matrix[col + 4] = this.array[col + 4]! / this.scaling.y;
            matrix[col + 8] = this.array[col + 8]! / this.scaling.z;
          }
          Quat.normalize(
            Mat4.getRotation(matrix, data.array as Float32Array<ArrayBuffer>),
            data.array as Float32Array<ArrayBuffer>,
          );
        },
      );
    }
    return this._rotation.data;
  }

  get up() {
    if (!this._up) {
      this._up = new MatrixComponent<Point3D>(this, new Point3D(), (data) => {
        Vec3.normalize(
          Vec3.set(
            this.array[4]!,
            this.array[5]!,
            this.array[6]!,
            data.array as Float32Array<ArrayBuffer>,
          ),
          data.array as Float32Array<ArrayBuffer>,
        );
      });
    }
    return this._up.data;
  }

  get down() {
    if (!this._down) {
      this._down = new MatrixComponent<Point3D>(this, new Point3D(), (data) => {
        Vec3.negate(this.up.array, data.array as Float32Array<ArrayBuffer>);
      });
    }
    return this._down.data;
  }

  get right() {
    if (!this._right) {
      this._right = new MatrixComponent<Point3D>(
        this,
        new Point3D(),
        (data) => {
          Vec3.negate(this.left.array, data.array as Float32Array<ArrayBuffer>);
        },
      );
    }
    return this._right.data;
  }

  get left() {
    if (!this._left) {
      this._left = new MatrixComponent<Point3D>(this, new Point3D(), (data) => {
        Vec3.normalize(
          Vec3.cross(
            this.up.array,
            this.forward.array,
            data.array as Float32Array<ArrayBuffer>,
          ),
          data.array as Float32Array<ArrayBuffer>,
        );
      });
    }
    return this._left.data;
  }

  get forward() {
    if (!this._forward) {
      this._forward = new MatrixComponent<Point3D>(
        this,
        new Point3D(),
        (data) => {
          Vec3.normalize(
            Vec3.set(
              this.array[8]!,
              this.array[9]!,
              this.array[10]!,
              data.array as Float32Array<ArrayBuffer>,
            ),
            data.array as Float32Array<ArrayBuffer>,
          );
        },
      );
    }
    return this._forward.data;
  }

  get backward() {
    if (!this._backward) {
      this._backward = new MatrixComponent<Point3D>(
        this,
        new Point3D(),
        (data) => {
          Vec3.negate(
            this.forward.array,
            data.array as Float32Array<ArrayBuffer>,
          );
        },
      );
    }
    return this._backward.data;
  }

  override copyFrom(matrix: Matrix4x4) {
    if (matrix instanceof Matrix4x4) {
      Mat4.copy(matrix.array, this.array);
      this._transformId++;
    }
    return this;
  }

  setFrom(array: ArrayLike<number>) {
    Mat4.copy(<Float32Array>array, this.array);
    this._transformId++;
    return this;
  }

  setFromRotationPositionScale(
    rotation: Quaternion,
    position: Point3D,
    scaling: Point3D,
  ) {
    Mat4.fromRotationTranslationScale(
      rotation.array,
      position.array,
      scaling.array,
      this.array,
    );
    this._transformId++;
  }

  multiply(matrix: Matrix4x4) {
    Mat4.multiply(matrix.array, this.array, this.array);
    this._transformId++;
  }

  static translate(mat: Matrix4x4, v: Point3D, out = new Matrix4x4()) {
    return out.setFrom(Mat4.translate(mat.array, v.array, temp));
  }

  static fromQuaternion(q: Quaternion, out = new Matrix4x4()) {
    return out.setFrom(Mat4.fromQuat(q.array, temp));
  }

  static fromRotationTranslationScale(
    q: Quaternion,
    v: Point3D,
    s: Point3D,
    out = new Matrix4x4(),
  ) {
    return out.setFrom(
      Mat4.fromRotationTranslationScale(q.array, v.array, s.array, temp),
    );
  }

  static fromRotation(rad: number, axis: Point3D, out = new Matrix4x4()) {
    return out.setFrom(Mat4.fromRotation(rad, axis.array, temp));
  }

  static fromScaling(v: Point3D, out = new Matrix4x4()) {
    return out.setFrom(Mat4.fromScaling(v.array, temp));
  }

  static fromTranslation(v: Point3D, out = new Matrix4x4()) {
    return out.setFrom(Mat4.fromTranslation(v.array, temp));
  }

  static lookAt(
    eye: Point3D,
    center: Point3D,
    up: Point3D,
    out = new Matrix4x4(),
  ) {
    return out.setFrom(Mat4.lookAt(eye.array, center.array, up.array, temp));
  }

  static identity(out = new Matrix4x4()) {
    return out.setFrom(Mat4.identity(temp));
  }

  static perspective(
    fovy: number,
    aspect: number,
    near: number,
    far: number,
    out = new Matrix4x4(),
  ) {
    return out.setFrom(Mat4.perspective(fovy, aspect, near, far, temp));
  }

  static ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    out = new Matrix4x4(),
  ) {
    return out.setFrom(Mat4.ortho(left, right, bottom, top, near, far, temp));
  }

  static invert(a: Matrix4x4, out = new Matrix4x4()) {
    return out.setFrom(Mat4.invert(a.array, temp));
  }

  static transpose(a: Matrix4x4, out = new Matrix4x4()) {
    return out.setFrom(Mat4.transpose(a.array, temp));
  }

  static targetTo(
    eye: Point3D,
    target: Point3D,
    up: Point3D,
    out = new Matrix4x4(),
  ) {
    return out.setFrom(Mat4.targetTo(eye.array, target.array, up.array, temp));
  }

  static rotateX(a: Matrix4x4, rad: number, out = new Matrix4x4()) {
    return out.setFrom(Mat4.rotateX(a.array, rad, temp));
  }

  static rotateY(a: Matrix4x4, rad: number, out = new Matrix4x4()) {
    return out.setFrom(Mat4.rotateY(a.array, rad, temp));
  }

  static rotateZ(a: Matrix4x4, rad: number, out = new Matrix4x4()) {
    return out.setFrom(Mat4.rotateZ(a.array, rad, temp));
  }

  static rotate(
    a: Matrix4x4,
    rad: number,
    axis: Point3D,
    out = new Matrix4x4(),
  ) {
    return out.setFrom(Mat4.rotate(a.array, rad, axis.array, temp));
  }

  static scale(a: Matrix4x4, v: Point3D, out = new Matrix4x4()) {
    return out.setFrom(Mat4.scale(a.array, v.array, temp));
  }
}
