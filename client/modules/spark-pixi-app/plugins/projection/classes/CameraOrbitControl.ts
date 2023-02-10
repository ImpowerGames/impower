import { ObservablePoint } from "@pixi/core";
import { Quat, Vec3 } from "pixi3d/pixi7";
import { Camera } from "./Camera";

export class CameraOrbitControl {
  private _distance = 5;

  private _grabbed = false;

  private _startPinchDistance = 0;

  protected _angles = new ObservablePoint(
    () => {
      this._angles.x = Math.min(Math.max(-85, this._angles.x), 85);
    },
    undefined,
    0,
    180
  );

  /**
   * Orientation euler angles (x-axis and y-axis). The angle for the x-axis
   * will be clamped between -85 and 85 degrees.
   */
  get angles(): ObservablePoint {
    return this._angles;
  }

  /** Target position (x, y, z) to orbit. */
  target = { x: 0, y: 0, z: 0 };

  /** Allows the camera to be controlled by user. */
  controllable = true;

  /**
   * Creates a new camera orbit control.
   * @param element The element for listening to user events.
   * @param camera The camera to control. If not set, the main camera will be used
   * by default.
   */
  constructor(element: HTMLElement, public camera = Camera.main) {
    this.camera.renderer.on("prerender", () => {
      this.updateCamera();
    });
    element.addEventListener("pointerdown", () => {
      this._grabbed = true;
    });
    element.addEventListener("pointerup", () => {
      this._grabbed = false;
    });
    element.addEventListener("pointermove", (event) => {
      if (this.controllable && this._grabbed && event.buttons === 1) {
        this._angles.x += event.movementY * 0.5;
        this._angles.y -= event.movementX * 0.5;
      }
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
    });
    element.addEventListener("wheel", (event) => {
      if (this.controllable) {
        this.distance += event.deltaY * 0.01;
        event.preventDefault();
      }
    });
  }

  /**
   * Updates the position and rotation of the camera.
   */
  updateCamera(): void {
    const rot = Quat.fromEuler(
      this._angles.x,
      this._angles.y,
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
        this.target.x,
        this.target.y,
        this.target.z,
        new Float32Array(3)
      ),
      Vec3.scale(dir, this.distance, new Float32Array(3)),
      new Float32Array(3)
    );

    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.rotationQuaternion.set(rot[0], rot[1], rot[2], rot[3]);
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
