import {
  DEG_TO_RAD,
  type DestroyOptions,
  ObservablePoint,
  Point,
  type PointData,
  type Renderer,
} from "pixi.js";
import { Container3D } from "../container-3d";
import { Mat4 } from "../math/mat4";
import { Ray } from "../math/ray";
import { Vec3 } from "../math/vec3";
import { Vec4 } from "../math/vec4";
import { Matrix4x4 } from "../transform/matrix";
import { MatrixComponent } from "../transform/matrix-component";
import { Point3D } from "../transform/point";
import type { TransformId } from "../transform/transform-id";

const vec3 = new Float32Array(3);
const mat4 = new Float32Array(16);
const vec4 = new Float32Array(4);

export class Camera extends Container3D implements TransformId {
  private _transformId = 0;

  get transformId() {
    return this.transform._worldID + this._transformId;
  }

  private _projection?: MatrixComponent<Matrix4x4>;
  private _view?: MatrixComponent<Matrix4x4>;
  private _viewProjection?: MatrixComponent<Matrix4x4>;
  private _orthographic = false;
  private _orthographicSize = 10;
  private _obliqueness = new ObservablePoint(
    {
      _onUpdate: () => {
        this._transformId++;
      },
    },
    undefined,
  );

  get obliqueness() {
    return this._obliqueness;
  }

  set obliqueness(value: PointData) {
    this._obliqueness.copyFrom(value);
  }

  static main: Camera;

  _localID = -1;

  constructor(public renderer: Renderer) {
    super();

    this.renderer.runners.prerender.add(this);
    if (!Camera.main) {
      Camera.main = this;
    }
    this.transform.position.z = 5;
    this.transform.rotationQuaternion.setAngles(0, 180, 0);
  }

  override destroy(options?: boolean | DestroyOptions) {
    super.destroy(options);
    this.renderer.runners.prerender.remove(this);
    if (this === Camera.main) {
      // @ts-ignore It's ok, main camera was destroyed.
      Camera.main = undefined;
    }
  }

  get orthographicSize() {
    return this._orthographicSize;
  }

  set orthographicSize(value: number) {
    if (this._orthographicSize !== value) {
      this._orthographicSize = value;
      this._transformId++;
    }
  }

  get orthographic() {
    return this._orthographic;
  }

  set orthographic(value: boolean) {
    if (this._orthographic !== value) {
      this._orthographic = value;
      this._transformId++;
    }
  }

  protected _pixelsPerUnit = 100;
  get pixelsPerUnit() {
    return this._pixelsPerUnit;
  }
  set pixelsPerUnit(value: number) {
    if (value !== this._pixelsPerUnit) {
      this._pixelsPerUnit = value;
    }
  }

  screenToRay(
    x: number,
    y: number,
    viewSize: { width: number; height: number } = this.renderer.screen,
  ) {
    let screen = this.screenToWorld(x, y, 1, undefined, viewSize);
    if (screen) {
      if (this.orthographic) {
        return new Ray(screen, this.worldTransform.forward);
      }
      return new Ray(
        this.worldTransform.position,
        Point3D.subtract(screen, this.worldTransform.position),
      );
    }
    return undefined;
  }

  screenToWorld(
    x: number,
    y: number,
    distance: number,
    out = new Point3D(),
    viewSize: { width: number; height: number } = this.renderer.screen,
  ) {
    this.transform.updateTransform(
      (this.parent as unknown as Container3D)?.transform,
    );

    let far = this.far;

    this.far = distance;

    let invertedViewProjection = Mat4.invert(this.viewProjection.array, mat4);
    if (invertedViewProjection === null) {
      return;
    }
    let clipSpace = Vec4.set(
      (x / viewSize.width) * 2 - 1,
      ((y / viewSize.height) * 2 - 1) * -1,
      1,
      1,
      vec4,
    );
    this.far = far;

    let worldSpace = Vec4.transformMat4(
      clipSpace,
      invertedViewProjection,
      vec4,
    );
    worldSpace[3] = 1.0 / worldSpace[3]!;
    for (let i = 0; i < 3; i++) {
      worldSpace[i]! *= worldSpace[3]!;
    }
    return out.set(worldSpace[0]!, worldSpace[1]!, worldSpace[2]!);
  }

  worldToScreen(
    x: number,
    y: number,
    z: number,
    out = new Point(),
    viewSize: { width: number; height: number } = this.renderer.screen,
  ) {
    this.transform.updateTransform(
      (this.parent as unknown as Container3D)?.transform,
    );

    const worldSpace = Vec4.set(x, y, z, 1, vec4);
    const a = Vec4.transformMat4(worldSpace, this.view.array, vec4);
    const clipSpace = Vec4.transformMat4(a, this.projection.array, vec4);
    if (clipSpace[3] !== 0) {
      for (let i = 0; i < 3; i++) {
        clipSpace[i]! /= clipSpace[3]!;
      }
    }
    return out.set(
      ((clipSpace[0]! + 1) / 2) * viewSize.width,
      viewSize.height - ((clipSpace[1]! + 1) / 2) * viewSize.height,
    );
  }

  worldToView(x: number, y: number, z: number, out = new Point3D()): Point3D {
    this.transform.updateTransform(
      (this.parent as unknown as Container3D)?.transform,
    );

    const worldVec = Vec4.set(x, y, z, 1, vec4);

    const viewVec = Vec4.transformMat4(worldVec, this.view.array, vec4);

    return out.set(viewVec[0]!, viewVec[1]!, viewVec[2]!);
  }

  updateMatrixes() {
    this._view?.update();
    this._projection?.update();
    this._viewProjection?.update();
  }

  prerender() {
    if (this.renderer.width / this.renderer.height !== this._aspect) {
      this._transformId++;
      this._aspect = this.renderer.width / this.renderer.height;
    }
    // @ts-ignore: _localID do exist, but be careful if this changes.
    if (!this.parent && this._localID !== this.transform._localID) {
      this.transform.updateTransform();
      // @ts-ignore: _localID do exist, but be careful if this changes.
      this._localID = this.transform._localID;
    }
  }

  get focalLength(): number {
    const viewHeight = this.renderer.height;
    const fovInRadians = this._fieldOfView * DEG_TO_RAD;
    return viewHeight / 2 / Math.tan(fovInRadians / 2);
  }

  private _fieldOfView = 60;
  private _near = 0.1;
  private _far = 1000;
  private _aspect?: number;

  get aspect() {
    return this._aspect;
  }

  set aspect(value: number | undefined) {
    if (this._aspect !== value) {
      this._aspect = value;
      this._transformId++;
    }
  }

  get fieldOfView() {
    return this._fieldOfView;
  }

  set fieldOfView(value: number) {
    if (this._fieldOfView !== value) {
      this._fieldOfView = value;
      this._transformId++;
    }
  }

  get near() {
    return this._near;
  }

  set near(value: number) {
    if (this._near !== value) {
      this._near = value;
      this._transformId++;
    }
  }

  get far() {
    return this._far;
  }

  set far(value: number) {
    if (this._far !== value) {
      this._far = value;
      this._transformId++;
    }
  }

  get projection() {
    if (!this._projection) {
      this._projection = new MatrixComponent<Matrix4x4>(
        this,
        new Matrix4x4(),
        (data) => {
          const aspect =
            this._aspect || this.renderer.width / this.renderer.height;
          if (this._orthographic) {
            Mat4.ortho(
              -this._orthographicSize * aspect,
              this._orthographicSize * aspect,
              -this._orthographicSize,
              this._orthographicSize,
              this._near,
              this._far,
              data.array,
            );
          } else {
            Mat4.perspective(
              this._fieldOfView * DEG_TO_RAD,
              aspect,
              this._near,
              this._far,
              data.array,
            );
            data.array[8] = this._obliqueness.x;
            data.array[9] = this._obliqueness.y;
          }
        },
      );
    }
    return this._projection.data;
  }

  get view() {
    if (!this._view) {
      this._view = new MatrixComponent<Matrix4x4>(
        this,
        new Matrix4x4(),
        (data) => {
          const target = Vec3.add(
            this.worldTransform.position.array,
            this.worldTransform.forward.array,
            vec3,
          );
          Mat4.lookAt(
            this.worldTransform.position.array,
            target,
            this.worldTransform.up.array,
            data.array,
          );
        },
      );
    }
    return this._view.data;
  }

  get viewProjection() {
    if (!this._viewProjection) {
      this._viewProjection = new MatrixComponent<Matrix4x4>(
        this,
        new Matrix4x4(),
        (data) => {
          Mat4.multiply(this.projection.array, this.view.array, data.array);
        },
      );
    }
    return this._viewProjection.data;
  }
}
