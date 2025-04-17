import {
  DestroyOptions,
  ObservablePoint,
  PerspectiveMesh,
  Point,
  Texture,
} from "pixi.js";
import { Camera } from "../camera/camera";
import { Container3D } from "../container";
import { Vec3 } from "../math/vec3";
import { Point3D } from "../transform/point";
import { Transform3D } from "../transform/transform";
import { SpriteBillboardType } from "./sprite-billboard-type";

// Allocate these once and then reuse them
const point = new Point3D();
const cornerOffsets: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const localCorners = [
  new Point3D(),
  new Point3D(),
  new Point3D(),
  new Point3D(),
];
const worldCorners = [
  new Point3D(),
  new Point3D(),
  new Point3D(),
  new Point3D(),
];
const screenCorners = [new Point(), new Point(), new Point(), new Point()];

/**
 * A sprite positioned in 3D space with billboarding and perspective scaling.
 */
export class Sprite3D extends PerspectiveMesh {
  /**
   * The transform in 3D space.
   */
  transform = new Transform3D();

  protected _camera: Camera;
  /**
   * The camera this sprite is rendered relative to.
   */
  get camera() {
    return this._camera;
  }

  protected _billboardType: SpriteBillboardType = SpriteBillboardType.none;
  /**
   * The billboard type to use when rendering the sprite.
   * Used for making the sprite always face the viewer.
   */
  get billboardType() {
    return this._billboardType;
  }
  set billboardType(value) {
    if (value !== this._billboardType) {
      this._billboardType = value;
    }
  }

  protected _anchor: ObservablePoint = new ObservablePoint(
    { _onUpdate: () => {} },
    0.5,
    0.5
  );
  /**
   * The anchor point of the sprite.
   */
  get anchor() {
    return this._anchor;
  }
  set anchor(value) {
    this._anchor = value;
  }

  constructor(texture: Texture, camera: Camera) {
    const width = texture.width / camera.pixelsPerUnit;
    const height = texture.height / camera.pixelsPerUnit;

    super({
      texture,
      pivot: {
        x: width / 2,
        y: height / 2,
      },
      width,
      height,
    });

    this._camera = camera;

    this._camera.renderer.runners.prerender.add(this);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    this._camera.renderer.runners.prerender.remove(this);
  }

  calculateScreenCorners(
    hw: number,
    hh: number,
    rotRight: Float32Array,
    rotUp: Float32Array,
    out: Point[] = [new Point(), new Point(), new Point(), new Point()]
  ) {
    const spritePos = this.transform.worldTransform.position;

    // Use rotRight and rotUp to compute corners
    for (let i = 0; i < 4; i++) {
      const x = cornerOffsets[i]![0]! * hw;
      const y = cornerOffsets[i]![1]! * hh;
      const pos = localCorners[i]!;

      pos.set(
        spritePos.x + rotRight[0]! * x + rotUp[0]! * y,
        spritePos.y + rotRight[1]! * x + rotUp[1]! * y,
        spritePos.z + rotRight[2]! * x + rotUp[2]! * y
      );

      this._camera.worldToScreen(pos.x, pos.y, pos.z, out[i]!);
    }
    return out;
  }

  /**
   * Updates the sprite's 2D screen position, rotation, and scale based on the 3D transform.
   */
  prerender() {
    // Update local and world transform
    this.transform.updateTransform((this.parent as Container3D)?.transform);

    const spritePos = this.transform.worldTransform.position;

    // Compute screen position of center
    const screenCenter = point;
    this._camera.worldToScreen(
      spritePos.x,
      spritePos.y,
      spritePos.z,
      screenCenter
    );

    if (Number.isNaN(screenCenter.x) || Number.isNaN(screenCenter.y)) {
      // Invalid position, so no need to render
      this.visible = false;
      return;
    }

    // Get view space Z for depth check
    const viewPos = point;
    this._camera.worldToView(spritePos.x, spritePos.y, spritePos.z, viewPos);
    const depth = -viewPos.z;

    if (depth <= 0) {
      // Behind camera, so no need to render
      this.visible = false;
      return;
    }

    // Get half-width and half-height in local 3D space (object space)
    const hw =
      (this.texture.width * 0.5 * this.transform.scale.x) /
      this._camera.pixelsPerUnit;
    const hh =
      (this.texture.height * 0.5 * this.transform.scale.y) /
      this._camera.pixelsPerUnit;

    // Apply billboarding by modifying rotation in local space
    let rotRight = Vec3.right;
    let rotUp = Vec3.up;

    if (this._billboardType === SpriteBillboardType.spherical) {
      // Extract right and up vectors from camera's view matrix
      const view = this._camera.view.array;

      // Camera's local right
      rotRight[0] = view[0]!;
      rotRight[1] = view[4]!;
      rotRight[2] = view[8]!;

      // Camera's local up
      rotUp[0] = view[1]!;
      rotUp[1] = view[5]!;
      rotUp[2] = view[9]!;

      // Project to screen space
      this.calculateScreenCorners(hw, hh, rotRight, rotUp, screenCorners);
    } else if (this._billboardType === SpriteBillboardType.cylindrical) {
      // Extract right vector from camera's view matrix (X column)
      const view = this._camera.view.array;

      // Camera's local right
      rotRight[0] = view[0]!;
      rotRight[1] = view[4]!;
      rotRight[2] = view[8]!;

      // Use world up as-is for cylindrical mode (locks Y axis)
      rotUp.set(Vec3.up);

      // Project to screen space
      this.calculateScreenCorners(hw, hh, rotRight, rotUp, screenCorners);
    } else {
      // No billboarding: use transform matrix
      // Transform to world space
      this.transform.localToWorld(
        localCorners[0]!.set(-hw, -hh, 0),
        worldCorners[0]
      );
      this.transform.localToWorld(
        localCorners[1]!.set(hw, -hh, 0),
        worldCorners[1]
      );
      this.transform.localToWorld(
        localCorners[2]!.set(hw, hh, 0),
        worldCorners[2]
      );
      this.transform.localToWorld(
        localCorners[3]!.set(-hw, hh, 0),
        worldCorners[3]
      );

      // Project to screen space
      for (let i = 0; i < 4; i++) {
        const worldCorner = worldCorners[i]!;
        this._camera.worldToScreen(
          worldCorner.x,
          worldCorner.y,
          worldCorner.z,
          screenCorners[i]
        );
      }
    }

    // Apply corners to mesh
    this.setCorners(
      screenCorners[3]!.x,
      screenCorners[3]!.y, // top-left
      screenCorners[2]!.x,
      screenCorners[2]!.y, // top-right
      screenCorners[1]!.x,
      screenCorners[1]!.y, // bottom-right
      screenCorners[0]!.x,
      screenCorners[0]!.y // bottom-left
    );

    // Sprites that are closer to camera should render ontop of others
    this.zIndex = viewPos.z;

    // Sprite should render
    this.visible = true;
  }
}
