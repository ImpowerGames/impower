import { ObservablePoint } from "pixi.js";
import { Quat } from "../math/quat";
import { Vec3 } from "../math/vec3";
import { Point3D } from "../transform/point";
import { Camera } from "./camera";

// Allocate these once and then reuse
const rotVec4 = new Float32Array(4);
const dirVec3 = new Float32Array(3);
const posVec3 = new Float32Array(3);
const transformAVec3 = new Float32Array(3);
const subtractAVec3 = new Float32Array(3);
const subtractBVec3 = new Float32Array(3);

/**
 * Allows the user to control the camera by orbiting the target.
 */
export class CameraOrbitControl {
  protected _autoUpdate = true;
  /**
   * Whether to auto update the camera on prerender.
   * Default is true.
   */
  get autoUpdate(): boolean {
    return this._autoUpdate;
  }
  set autoUpdate(value: boolean) {
    this._autoUpdate = value;
  }

  protected _allowControl = true;
  /**
   * Allows the camera to be controlled by user.
   */
  get allowControl(): boolean {
    return this._allowControl;
  }
  set allowControl(value: boolean) {
    this._allowControl = value;
  }

  protected _camera = Camera.main;
  /**
   * The camera being controlled.
   */
  get camera(): Camera {
    return this._camera;
  }
  set camera(value: Camera) {
    this._camera = value;
  }

  protected _target = new Point3D(0, 0, 0, {
    _onUpdate: (point) => {
      if (!this._controlling) {
        this._dampingTarget.x = point?.x ?? 0;
        this._dampingTarget.y = point?.y ?? 0;
        this._dampingTarget.z = point?.z ?? 0;
      }
      this.updateCamera();
    },
  });
  /**
   * Target position (x, y, z) to orbit.
   */
  get target(): Point3D {
    return this._target;
  }
  set target(value: Point3D) {
    this._target.copyFrom(value);
    if (!this._controlling) {
      this._dampingTarget.x = value.x;
      this._dampingTarget.y = value.y;
      this._dampingTarget.z = value.z;
    }
    this.updateCamera();
  }

  protected _angles = new ObservablePoint(
    {
      _onUpdate: () => {
        this._angles.x = Math.min(Math.max(-85, this._angles.x), 85);
        if (!this._controlling) {
          this._dampingAngles.x = this._angles.x;
          this._dampingAngles.y = this._angles.y;
        }
        this.updateCamera();
      },
    },
    30,
    180
  );
  /**
   * Orientation euler angles (x-axis and y-axis).
   * The angle for the x-axis will be clamped between -85 and 85 degrees.
   * Default value is (30,180).
   */
  get angles() {
    return this._angles;
  }
  set angles(value: ObservablePoint) {
    this._angles.copyFrom(value);
    if (!this._controlling) {
      this._dampingAngles.x = this._angles.x;
      this._dampingAngles.y = this._angles.y;
    }
    this.updateCamera();
  }

  protected _distance = 5;
  /**
   * Distance between camera and the target.
   * Default value is 5.
   */
  get distance(): number {
    return this._distance;
  }
  set distance(value: number) {
    this._distance = Math.min(Math.max(value, 0.01), Number.MAX_SAFE_INTEGER);
    if (!this._controlling) {
      this._dampingDistance = this._distance;
    }
    this.updateCamera();
  }

  protected _enableDamping = true;
  /**
   * Value indicating if damping (inertia) is enabled, which can be used to give a sense of weight to the controls.
   * Default is true.
   */
  get enableDamping(): boolean {
    return this._enableDamping;
  }
  set enableDamping(value: boolean) {
    this._enableDamping = value;
    if (!value) {
      this._dampingAngles.x = this.angles.x;
      this._dampingAngles.y = this.angles.y;
      this._dampingDistance = this.distance;
      this._dampingTarget.x = this.target.x;
      this._dampingTarget.y = this.target.y;
      this._dampingTarget.z = this.target.z;
    }
  }

  protected _dampingFactor = 0.1;
  /**
   * The damping inertia used if enableDamping is true.
   * Default is 0.1.
   */
  get dampingFactor(): number {
    return this._dampingFactor;
  }
  set dampingFactor(value: number) {
    this._dampingFactor = value;
  }

  protected _panSpeed = 1;
  get panSpeed(): number {
    return this._panSpeed;
  }
  set panSpeed(value: number) {
    this._panSpeed = Math.max(0.001, value); // Prevent zero or negative
  }

  protected _zoomSpeed = 1;
  get zoomSpeed(): number {
    return this._zoomSpeed;
  }
  set zoomSpeed(value: number) {
    this._zoomSpeed = Math.max(0.001, value);
  }

  protected _element?: HTMLElement;

  protected _grabbed = false;

  protected _isPanning = false;

  protected _spacePressed = false;

  protected _previousPinchDistance = 0;

  protected _previousClientX = 0;

  protected _previousClientY = 0;

  protected _dampingAngles = { x: 0, y: 180 };

  protected _dampingDistance = 5;

  protected _dampingTarget = { x: 0, y: 0, z: 0 };

  protected _controlling = false;

  /**
   * Creates a new camera orbit control.
   * @param element The element for listening to user events.
   * @param camera The camera to control.
   * by default.
   */
  constructor(camera: Camera, element?: HTMLElement) {
    this._element = element;
    this._camera = camera;
    this.bind();
  }

  protected prerender() {
    if (this.autoUpdate) {
      this.updateCamera();
    }
  }

  destroy(): void {
    this.unbind();
  }

  protected onPointerDown = (clientX: number, clientY: number): void => {
    this._grabbed = true;
    this._previousClientX = clientX;
    this._previousClientY = clientY;
  };

  protected onPointerUp = (): void => {
    this._grabbed = false;
  };

  protected onPointerMove = (clientX: number, clientY: number): void => {
    if (this.allowControl) {
      this._controlling = true;
      if (this._grabbed) {
        const movementX = clientX - this._previousClientX;
        const movementY = clientY - this._previousClientY;
        this.angles.x += movementY * 0.5;
        this.angles.y -= movementX * 0.5;
        this.updateCamera();
        this._previousClientX = clientX;
        this._previousClientY = clientY;
      }
      this._controlling = false;
    }
  };

  protected onMouseDown = (e: MouseEvent): void => {
    if (this.allowControl) {
      this._controlling = true;
      // Middle-click or Right-click or Spacebar initiates panning
      if (e.button === 1 || e.button === 2 || this._spacePressed) {
        // Don't initiate scroll or context menu behaviour
        e.preventDefault();
        this._isPanning = true;
      } else {
        this._isPanning = false;
      }
      this.onPointerDown(e.clientX, e.clientY);
      this._controlling = false;
    }
  };

  protected onMouseMove = (e: MouseEvent): void => {
    if (this.allowControl && this._grabbed) {
      this._controlling = true;
      const movementX = e.clientX - this._previousClientX;
      const movementY = e.clientY - this._previousClientY;

      if (this._isPanning) {
        const scale = this.distance * 0.01 * this.panSpeed;
        const right = Vec3.set(1, 0, 0, new Float32Array(3));
        const up = Vec3.set(0, 1, 0, new Float32Array(3));
        const rot = Quat.fromEuler(
          this.angles.x,
          this.angles.y,
          0,
          new Float32Array(4)
        );

        const worldRight = Vec3.transformQuat(right, rot, new Float32Array(3));
        const worldUp = Vec3.transformQuat(up, rot, new Float32Array(3));

        this._target.x -=
          (worldRight[0]! * movementX + worldUp[0]! * movementY) * scale;
        this._target.y -=
          (worldRight[1]! * movementX + worldUp[1]! * movementY) * scale;
        this._target.z -=
          (worldRight[2]! * movementX + worldUp[2]! * movementY) * scale;

        this.updateCamera();
      } else {
        this.angles.x += movementY * 0.5;
        this.angles.y -= movementX * 0.5;
        this.updateCamera();
      }

      this._previousClientX = e.clientX;
      this._previousClientY = e.clientY;
      this._controlling = false;
    }
  };

  protected onMouseUp = (_e: MouseEvent): void => {
    if (this.allowControl) {
      this._grabbed = false;
      this._isPanning = false;
    }
  };

  protected onWheel = (e: WheelEvent): void => {
    if (this.allowControl) {
      this._controlling = true;
      this.distance += e.deltaY * 0.01 * this.zoomSpeed;
      e.preventDefault();
      this.updateCamera();
      this._controlling = false;
    }
  };

  protected onTouchStart = (e: TouchEvent): void => {
    if (this.allowControl) {
      this._controlling = true;
      const touch = e?.targetTouches?.[0];
      if (touch) {
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        this.onPointerDown(clientX, clientY);
      }
      if (e.touches.length === 2) {
        e.preventDefault(); // Prevent page scroll
        this._previousPinchDistance = Math.hypot(
          e.touches[0]!.clientX - e.touches[1]!.clientX,
          e.touches[0]!.clientY - e.touches[1]!.clientY
        );
      }
      this._controlling = false;
    }
  };

  protected onPinch = (e: TouchEvent): void => {
    if (this.allowControl) {
      this._controlling = true;
      e.preventDefault(); // Prevent page scroll
      const currentPinchDistance = Math.hypot(
        e.touches[0]!.clientX - e.touches[1]!.clientX,
        e.touches[0]!.clientY - e.touches[1]!.clientY
      );
      const deltaPinchDistance =
        currentPinchDistance - this._previousPinchDistance;
      this.distance -= deltaPinchDistance * 0.1 * this.zoomSpeed;
      this.updateCamera();
      this._previousPinchDistance = currentPinchDistance;
      this._controlling = false;
    }
  };

  protected onTouchMove = (e: TouchEvent): void => {
    if (this.allowControl) {
      this._controlling = true;
      const touch = e?.targetTouches?.[0];
      if (e.touches.length === 1 && touch) {
        const clientX = touch.clientX;
        const clientY = touch.clientY;
        this.onPointerMove(clientX, clientY);
      }
      if (e.touches.length === 2) {
        this.onPinch(e);
      }
      this._controlling = false;
    }
  };

  protected onTouchEnd = (e: TouchEvent): void => {
    if (this.allowControl) {
      this._controlling = true;
      if (e.touches.length === 0) {
        this.onPointerUp();
      }
      this._controlling = false;
    }
  };

  protected onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      this._spacePressed = true;
    }
  };

  protected onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      this._spacePressed = false;
    }
  };

  protected onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  protected bind(): void {
    this.camera.renderer.runners.prerender.add(this);
    this._element?.addEventListener("mousedown", this.onMouseDown);
    this._element?.addEventListener("touchstart", this.onTouchStart, {
      passive: false,
    });
    this._element?.addEventListener("wheel", this.onWheel, { passive: false });
    if (!this._element) {
      window.addEventListener("mousedown", this.onMouseDown);
      window.addEventListener("touchstart", this.onTouchStart, {
        passive: false,
      });
      window.addEventListener("wheel", this.onWheel, { passive: false });
    }
    // Bind mouse and touch equivalent pointermove and pointerup events to window
    // to support the case where the pointer leaves the element while dragging

    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("touchmove", this.onTouchMove, { passive: false });
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("touchend", this.onTouchEnd);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("contextmenu", this.onContextMenu);
  }

  protected unbind(): void {
    this.camera.renderer.runners.prerender.remove(this);
    this._element?.removeEventListener("mousedown", this.onMouseDown);
    this._element?.removeEventListener("touchstart", this.onTouchStart);
    this._element?.removeEventListener("wheel", this.onWheel);
    if (!this._element) {
      window.removeEventListener("mousedown", this.onMouseDown);
      window.removeEventListener("touchstart", this.onTouchStart);
      window.removeEventListener("wheel", this.onWheel);
    }
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
  }

  fitToBoundingBox(
    target: Point3D,
    radius: number,
    padding: number = 1.2,
    resetAngles = true
  ) {
    this.target.x = target.x;
    this.target.y = target.y;
    this.target.z = target.z;
    this.distance = radius * padding;

    if (resetAngles) {
      this.angles.x = 30;
      this.angles.y = 180;
    }
  }

  fitToAABB(min: Point3D, max: Point3D) {
    const center = new Point3D(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2
    );

    const dx = max.x - min.x;
    const dy = max.y - min.y;
    const dz = max.z - min.z;
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

    this.fitToBoundingBox(center, radius);
  }

  /**
   * Updates the position and rotation of the camera.
   */
  updateCamera(): void {
    if (this.enableDamping) {
      this._dampingAngles.x +=
        (this.angles.x - this._dampingAngles.x) * this.dampingFactor;
      this._dampingAngles.y +=
        (this.angles.y - this._dampingAngles.y) * this.dampingFactor;
      this._dampingDistance +=
        (this.distance - this._dampingDistance) * this.dampingFactor;
    }

    const angles = this.enableDamping ? this._dampingAngles : this.angles;
    const distance = this.enableDamping ? this._dampingDistance : this.distance;

    Quat.fromEuler(angles.x, angles.y, 0, rotVec4);
    Vec3.transformQuat(Vec3.set(0, 0, 1, transformAVec3), rotVec4, dirVec3);
    if (this.enableDamping) {
      this._dampingTarget.x +=
        (this.target.x - this._dampingTarget.x) * this.dampingFactor;
      this._dampingTarget.y +=
        (this.target.y - this._dampingTarget.y) * this.dampingFactor;
      this._dampingTarget.z +=
        (this.target.z - this._dampingTarget.z) * this.dampingFactor;
    }

    const effectiveTarget = this.enableDamping
      ? this._dampingTarget
      : this.target;

    Vec3.subtract(
      Vec3.set(
        effectiveTarget.x,
        effectiveTarget.y,
        effectiveTarget.z,
        subtractAVec3
      ),
      Vec3.scale(dirVec3, distance, subtractBVec3),
      posVec3
    );

    this.camera.position.set(posVec3[0]!, posVec3[1]!, posVec3[2]!);
    this.camera.rotationQuaternion.set(
      rotVec4[0]!,
      rotVec4[1]!,
      rotVec4[2]!,
      rotVec4[3]!
    );
  }
}
