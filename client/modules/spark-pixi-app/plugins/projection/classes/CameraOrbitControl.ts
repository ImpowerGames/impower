import { ObservablePoint } from "@pixi/core";
import { Quat, Vec3 } from "pixi3d/pixi7";
import { Camera } from "./Camera";

export class CameraOrbitControl {
  private _distance = 5;

  private _grabbed = false;

  private _startPinchDistance = 0;

  protected _angle = new ObservablePoint(
    () => {
      this._angle.x = Math.min(Math.max(-85, this._angle.x), 85);
    },
    undefined,
    0,
    180
  );

  get angle(): ObservablePoint {
    return this._angle;
  }

  /** Target position (x, y, z) to orbit. */
  protected _target = { x: 0, y: 0, z: 0 };

  get target(): { x: number; y: number; z: number } {
    return this._target;
  }

  /** Allows the camera to be controlled by user. */
  controllable = true;

  /**
   * Creates a new camera orbit control.
   * @param element The element for listening to user events.
   * @param camera The camera to control. If not set, the main camera will be used
   * by default.
   */
  constructor(element: HTMLElement, public camera = Camera.main) {
    element.addEventListener("pointerdown", () => {
      this._grabbed = true;
    });
    element.addEventListener("pointerup", () => {
      this._grabbed = false;
    });
    element.addEventListener("pointermove", (event) => {
      if (this.controllable && this._grabbed && event.buttons === 1) {
        this._angle.x += event.movementY * 0.5;
        this._angle.y -= event.movementX * 0.5;
      }
      this.update();
    });
    element.addEventListener("wheel", (event) => {
      if (this.controllable) {
        this.distance += event.deltaY * 0.01;
        event.preventDefault();
      }
      this.update();
    });
    element.addEventListener("touchstart", (event) => {
      if (event.touches.length === 2) {
        event.preventDefault(); // Prevent page scroll
        this._startPinchDistance = Math.hypot(
          event.touches[0].pageX - event.touches[1].pageX,
          event.touches[0].pageY - event.touches[1].pageY
        );
      }
    });
    element.addEventListener("touchmove", (event) => {
      if (event.touches.length === 2) {
        event.preventDefault(); // Prevent page scroll
        const currentPinchDistance = Math.hypot(
          event.touches[0].pageX - event.touches[1].pageX,
          event.touches[0].pageY - event.touches[1].pageY
        );
        const deltaPinchDistance =
          currentPinchDistance - this._startPinchDistance;
        this.distance += deltaPinchDistance * 0.01;
      }
      this.update();
    });
  }

  /**
   * Updates the rotation of the camera.
   */
  updateRotation(): void {
    const rot = Quat.fromEuler(
      this._angle.x,
      this._angle.y,
      0,
      new Float32Array(4)
    );
    this.camera.rotationQuaternion.set(rot[0], rot[1], rot[2], rot[3]);
  }

  /**
   * Updates the position of the camera.
   */
  updatePosition(): void {
    const rot = Quat.fromEuler(
      this._angle.x,
      this._angle.y,
      0,
      new Float32Array(4)
    );
    const dir = Vec3.transformQuat(
      Vec3.set(0, 0, 1, new Float32Array(3)),
      rot,
      new Float32Array(3)
    );
    const pos = Vec3.subtract(
      Vec3.set(
        this._target.x,
        this._target.y,
        this._target.z,
        new Float32Array(3)
      ),
      Vec3.scale(dir, this.distance, new Float32Array(3)),
      new Float32Array(3)
    );
    this.camera.position.set(pos[0], pos[1], pos[2]);
  }

  /**
   * Updates the position and rotation of the camera.
   */
  update(): void {
    this.updatePosition();
    this.updateRotation();
  }

  /**
   * Distance between camera and the target. Default value is 5.
   */
  get distance(): number {
    return this._distance;
  }

  set distance(value: number) {
    this._distance = Math.min(Math.max(value, 0.01), Number.MAX_SAFE_INTEGER);
  }
}
