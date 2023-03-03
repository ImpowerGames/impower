import { ObservablePoint } from "@pixi/core";
import { Quat, Vec3 } from "pixi3d/pixi7";
import { Camera } from "./Camera";

export class CameraOrbitControl {
  protected _controllable = true;

  /** Allows the camera to be controlled by user. */
  get controllable(): boolean {
    return this._controllable;
  }

  set controllable(value: boolean) {
    this._controllable = value;
  }

  protected _camera = Camera.main;

  /** Allows the camera to be controlled by user. */
  get camera(): Camera {
    return this._camera;
  }

  set camera(value: Camera) {
    this._camera = value;
  }

  protected _target = { x: 0, y: 0, z: 0 };

  /** Target position (x, y, z) to orbit. */
  get target(): { x: number; y: number; z: number } {
    return this._target;
  }

  protected _orbit = { x: 0, y: 180 };

  private _angles = new ObservablePoint(
    () => {
      this._orbit.x = Math.min(Math.max(-85, this._orbit.x), 85);
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

  protected _distance = 5;

  /**
   * Distance between camera and the target. Default value is 5.
   */
  get distance(): number {
    return this._distance;
  }

  set distance(value: number) {
    this._distance = Math.min(Math.max(value, 0.01), Number.MAX_SAFE_INTEGER);
  }

  /** Value indicating if damping (inertia) is enabled, which can be used to give a sense of weight to the controls. Default is false. */
  enableDamping = false;

  /** The damping inertia used if enableDamping is true. Default is 0.1. */
  dampingFactor = 0.1;

  protected _element: HTMLElement;

  protected _grabbed = false;

  protected _startPinchDistance = 0;

  protected _previousClientX = 0;

  protected _previousClientY = 0;

  protected _dampingAngles = new ObservablePoint(() => null, undefined, 0, 180);

  protected _dampingDistance = 5;

  /**
   * Creates a new camera orbit control.
   * @param element The element for listening to user events.
   * @param camera The camera to control. If not set, the main camera will be used
   * by default.
   */
  constructor(element: HTMLElement, camera = Camera.main) {
    this._element = element;
    this._camera = camera;
    this.bind();
  }

  destroy(): void {
    this.unbind();
  }

  onPointerDown = (event: PointerEvent): void => {
    this._grabbed = true;
    this._previousClientX = event.clientX;
    this._previousClientY = event.clientY;
  };

  onPointerUp = (): void => {
    this._grabbed = false;
  };

  onPointerMove = (event: PointerEvent): void => {
    if (this._grabbed) {
      const movementX = event.clientX - this._previousClientX;
      const movementY = event.clientY - this._previousClientY;
      this._orbit.x += movementY * 0.5;
      this._orbit.y -= movementX * 0.5;
      if (this.enableDamping) {
        this.damp();
      }
      this.updateCamera();
      this._previousClientX = event.clientX;
      this._previousClientY = event.clientY;
    }
  };

  onMouseDown = (event: MouseEvent): void => {
    if (this.controllable) {
      this.onPointerDown(event as PointerEvent);
    }
  };

  onMouseMove = (event: MouseEvent): void => {
    if (this.controllable) {
      if (event.buttons === 1) {
        this.onPointerMove(event as PointerEvent);
      }
    }
  };

  onMouseUp = (_event: MouseEvent): void => {
    if (this.controllable) {
      this.onPointerUp();
    }
  };

  onWheel = (event: WheelEvent): void => {
    if (this.controllable) {
      this.distance += event.deltaY * 0.01;
      event.preventDefault();
      if (this.enableDamping) {
        this.damp();
      }
      this.updateCamera();
    }
  };

  onTouchStart = (event: TouchEvent): void => {
    if (this.controllable) {
      const touch = event?.targetTouches?.[0];
      if (event.touches.length === 1 && touch) {
        const pointerEvent = event as unknown as {
          clientX: number;
          clientY: number;
        };
        pointerEvent.clientX = touch.clientX;
        pointerEvent.clientY = touch.clientY;
        this.onPointerDown(pointerEvent as PointerEvent);
      }
      if (event.touches.length === 2) {
        event.preventDefault(); // Prevent page scroll
        this._startPinchDistance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY
        );
      }
    }
  };

  onPinch = (event: TouchEvent): void => {
    if (this.controllable) {
      event.preventDefault(); // Prevent page scroll
      const currentPinchDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      const deltaPinchDistance =
        currentPinchDistance - this._startPinchDistance;
      this.distance += deltaPinchDistance * 0.01;
      if (this.enableDamping) {
        this.damp();
      }
      this.updateCamera();
    }
  };

  onTouchMove = (event: TouchEvent): void => {
    if (this.controllable) {
      const touch = event?.targetTouches?.[0];
      if (event.touches.length === 1 && touch) {
        const pointerEvent = event as unknown as {
          clientX: number;
          clientY: number;
        };
        pointerEvent.clientX = touch.clientX;
        pointerEvent.clientY = touch.clientY;
        this.onPointerMove(pointerEvent as PointerEvent);
      }
      if (event.touches.length === 2) {
        this.onPinch(event);
      }
    }
  };

  onTouchEnd = (event: TouchEvent): void => {
    if (this.controllable) {
      if (event.touches.length === 0) {
        this.onPointerUp();
      }
    }
  };

  /**
   * Updates the position and rotation of the camera.
   */
  updateCamera(): void {
    const angles = this.enableDamping ? this._dampingAngles : this._orbit;
    const distance = this.enableDamping
      ? this._dampingDistance
      : this._distance;

    const rot = Quat.fromEuler(angles.x, angles.y, 0, new Float32Array(4));
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
      Vec3.scale(dir, distance, new Float32Array(3)),
      new Float32Array(3)
    );

    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.rotationQuaternion.set(rot[0], rot[1], rot[2], rot[3]);
  }

  damp(): void {
    this._dampingAngles.x +=
      (this._orbit.x - this._dampingAngles.x) * this.dampingFactor;
    this._dampingAngles.y +=
      (this._orbit.y - this._dampingAngles.y) * this.dampingFactor;
    this._dampingDistance +=
      (this._distance - this._dampingDistance) * this.dampingFactor;
  }

  bind(): void {
    this._element.addEventListener("mousedown", this.onMouseDown);
    this._element.addEventListener("touchstart", this.onTouchStart);
    this._element.addEventListener("wheel", this.onWheel);
    // Bind to window instead of element just in case pointer leaves element while dragging
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("touchmove", this.onTouchMove);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("touchend", this.onTouchEnd);
  }

  unbind(): void {
    this._element.removeEventListener("mousedown", this.onMouseDown);
    this._element.removeEventListener("touchstart", this.onTouchStart);
    this._element.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("touchend", this.onTouchEnd);
  }
}
