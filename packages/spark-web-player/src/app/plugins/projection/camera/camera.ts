import {
  DEG_TO_RAD,
  DestroyOptions,
  ObservablePoint,
  Point,
  PointData,
  Renderer,
} from "pixi.js";
import { Container3D } from "../container-3d";
import { Mat4 } from "../math/mat4";
import { Ray } from "../math/ray";
import { Vec3 } from "../math/vec3";
import { Vec4 } from "../math/vec4";
import { Matrix4x4 } from "../transform/matrix";
import { MatrixComponent } from "../transform/matrix-component";
import { Point3D } from "../transform/point";
import { TransformId } from "../transform/transform-id";

const vec3 = new Float32Array(3);
const mat4 = new Float32Array(16);
const vec4 = new Float32Array(4);

/**
 * Camera is a device from which the world is viewed.
 */
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
    undefined
  );

  /**
   * Used for making the frustum oblique, which means that one side is at a
   * smaller angle to the centre line than the opposite side. Only works with
   * perspective projection.
   */
  get obliqueness() {
    return this._obliqueness;
  }

  set obliqueness(value: PointData) {
    this._obliqueness.copyFrom(value);
  }

  /** Main camera which is used by default. */
  static main: Camera;

  _localID = -1;

  /**
   * Creates a new camera using the specified renderer. By default the camera
   * looks towards negative z and is positioned at z = 5.
   * @param renderer Renderer to use.
   */
  constructor(public renderer: Renderer) {
    super();

    this.renderer.runners.prerender.add(this);
    if (!Camera.main) {
      Camera.main = this;
    }
    this.transform.position.z = 5;
    this.transform.rotationQuaternion.setEulerAngles(0, 180, 0);
  }

  override destroy(options?: boolean | DestroyOptions) {
    super.destroy(options);
    this.renderer.runners.prerender.remove(this);
    if (this === Camera.main) {
      // @ts-ignore It's ok, main camera was destroyed.
      Camera.main = undefined;
    }
  }

  /**
   * The camera's half-size when in orthographic mode. The visible area from
   * center of the screen to the top.
   */
  get orthographicSize() {
    return this._orthographicSize;
  }

  set orthographicSize(value: number) {
    if (this._orthographicSize !== value) {
      this._orthographicSize = value;
      this._transformId++;
    }
  }

  /**
   * Camera will render objects uniformly, with no sense of perspective.
   */
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
  /** The number of texture pixels (texels) that correspond to one unit of world space. */
  get pixelsPerUnit() {
    return this._pixelsPerUnit;
  }
  set pixelsPerUnit(value: number) {
    if (value !== this._pixelsPerUnit) {
      this._pixelsPerUnit = value;
    }
  }

  /**
   * Converts screen coordinates to a ray.
   * @param x Screen x coordinate.
   * @param y Screen y coordinate.
   * @param viewSize The size of the view when not rendering to the entire screen.
   */
  screenToRay(
    x: number,
    y: number,
    viewSize: { width: number; height: number } = this.renderer.screen
  ) {
    let screen = this.screenToWorld(x, y, 1, undefined, viewSize);
    if (screen) {
      if (this.orthographic) {
        return new Ray(screen, this.worldTransform.forward);
      }
      return new Ray(
        this.worldTransform.position,
        Point3D.subtract(screen, this.worldTransform.position)
      );
    }
    return undefined;
  }

  /**
   * Converts screen coordinates to world coordinates.
   * @param x Screen x coordinate.
   * @param y Screen y coordinate.
   * @param distance Distance from the camera.
   * @param out Point to set.
   * @param viewSize The size of the view when not rendering to the entire screen.
   */
  screenToWorld(
    x: number,
    y: number,
    distance: number,
    out = new Point3D(),
    viewSize: { width: number; height: number } = this.renderer.screen
  ) {
    // Make sure the transform is updated in case something has been changed,
    // otherwise it may be using wrong values.
    this.transform.updateTransform(
      (this.parent as unknown as Container3D)?.transform
    );

    let far = this.far;

    // Before doing the calculations, the far clip plane is changed to the same
    // value as distance from the camera. By doing this we can just set z value
    // for the clip space to 1 and the desired z position will be correct.
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
      vec4
    );
    this.far = far;

    let worldSpace = Vec4.transformMat4(
      clipSpace,
      invertedViewProjection,
      vec4
    );
    worldSpace[3] = 1.0 / worldSpace[3]!;
    for (let i = 0; i < 3; i++) {
      worldSpace[i]! *= worldSpace[3]!;
    }
    return out.set(worldSpace[0]!, worldSpace[1]!, worldSpace[2]!);
  }

  /**
   * Converts world coordinates to screen coordinates.
   * @param x World x coordinate.
   * @param y World y coordinate.
   * @param z World z coordinate.
   * @param out Point to set.
   * @param viewSize The size of the view when not rendering to the entire screen.
   */
  worldToScreen(
    x: number,
    y: number,
    z: number,
    out = new Point(),
    viewSize: { width: number; height: number } = this.renderer.screen
  ) {
    // Make sure the transform is updated in case something has been changed,
    // otherwise it may be using wrong values.
    this.transform.updateTransform(
      (this.parent as unknown as Container3D)?.transform
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
      viewSize.height - ((clipSpace[1]! + 1) / 2) * viewSize.height
    );
  }

  worldToView(x: number, y: number, z: number, out = new Point3D()): Point3D {
    // Ensure the view matrix is up to date
    this.transform.updateTransform(
      (this.parent as unknown as Container3D)?.transform
    );

    // Convert Point3D to Vec4
    const worldVec = Vec4.set(x, y, z, 1, vec4);

    // Transform by the view matrix
    const viewVec = Vec4.transformMat4(worldVec, this.view.array, vec4);

    // Return as a Point3D
    return out.set(viewVec[0]!, viewVec[1]!, viewVec[2]!);
  }

  updateMatrixes() {
    this._view?.update();
    this._projection?.update();
    this._viewProjection?.update();
  }

  prerender() {
    if (!this._aspect) {
      // When there is no specific aspect set, this is used for the
      // projection matrix to always update each frame (in case when the
      // renderer aspect ratio has changed).
      if (this.renderer.width / this.renderer.height !== this._aspect) {
        this._transformId++;
        this._aspect = this.renderer.width / this.renderer.height;
      }
    }
    // @ts-ignore: _localID do exist, but be careful if this changes.
    if (!this.parent && this._localID !== this.transform._localID) {
      // When the camera is not attached to the scene hierarchy the transform
      // needs to be updated manually.
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

  /**
   * The aspect ratio (width divided by height). If not set, the aspect ratio of
   * the renderer will be used by default.
   */
  get aspect() {
    return this._aspect;
  }

  set aspect(value: number | undefined) {
    if (this._aspect !== value) {
      this._aspect = value;
      this._transformId++;
    }
  }

  /** The vertical field of view in degrees, 60 is the default value. */
  get fieldOfView() {
    return this._fieldOfView;
  }

  set fieldOfView(value: number) {
    if (this._fieldOfView !== value) {
      this._fieldOfView = value;
      this._transformId++;
    }
  }

  /** The near clipping plane distance, 0.1 is the default value. */
  get near() {
    return this._near;
  }

  set near(value: number) {
    if (this._near !== value) {
      this._near = value;
      this._transformId++;
    }
  }

  /** The far clipping plane distance, 1000 is the default value. */
  get far() {
    return this._far;
  }

  set far(value: number) {
    if (this._far !== value) {
      this._far = value;
      this._transformId++;
    }
  }

  /** Returns the projection matrix. */
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
              data.array
            );
          } else {
            Mat4.perspective(
              this._fieldOfView * DEG_TO_RAD,
              aspect,
              this._near,
              this._far,
              data.array
            );
            data.array[8] = this._obliqueness.x;
            data.array[9] = this._obliqueness.y;
          }
        }
      );
    }
    return this._projection.data;
  }

  /** Returns the view matrix. */
  get view() {
    if (!this._view) {
      this._view = new MatrixComponent<Matrix4x4>(
        this,
        new Matrix4x4(),
        (data) => {
          const target = Vec3.add(
            this.worldTransform.position.array,
            this.worldTransform.forward.array,
            vec3
          );
          Mat4.lookAt(
            this.worldTransform.position.array,
            target,
            this.worldTransform.up.array,
            data.array
          );
        }
      );
    }
    return this._view.data;
  }

  /** Returns the view projection matrix. */
  get viewProjection() {
    if (!this._viewProjection) {
      this._viewProjection = new MatrixComponent<Matrix4x4>(
        this,
        new Matrix4x4(),
        (data) => {
          Mat4.multiply(this.projection.array, this.view.array, data.array);
        }
      );
    }
    return this._viewProjection.data;
  }
}
