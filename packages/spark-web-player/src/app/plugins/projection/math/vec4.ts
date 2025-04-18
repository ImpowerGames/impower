/*
 * Based on pixi3d <https://github.com/jnsmalm/pixi3d>
 *
 * Copyright (c) 2023 Jens Malmborg
 * Released under the MIT license.
 */

import { vec4 } from "gl-matrix";

export class Vec4 {
  static set(
    x: number,
    y: number,
    z: number,
    w: number,
    out: Float32Array = new Float32Array(4)
  ) {
    return <Float32Array>vec4.set(out, x, y, z, w);
  }
  static transformMat4(
    a: Float32Array,
    m: Float32Array,
    out: Float32Array = new Float32Array(4)
  ) {
    return <Float32Array>vec4.transformMat4(out, a, m);
  }
  static fromValues(x: number, y: number, z: number, w: number) {
    return <Float32Array>vec4.fromValues(x, y, z, w);
  }
}
