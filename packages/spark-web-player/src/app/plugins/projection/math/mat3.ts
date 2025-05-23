/*
 * Based on pixi3d <https://github.com/jnsmalm/pixi3d>
 *
 * Copyright (c) 2023 Jens Malmborg
 * Released under the MIT license.
 */

import { mat3 } from "gl-matrix";

export class Mat3 {
  static multiply(a: Float32Array, b: Float32Array, out = new Float32Array(9)) {
    return <Float32Array>mat3.multiply(out, a, b);
  }
}
