import {
  type DestroyOptions,
  ObservablePoint,
  PerspectiveMesh,
  Point,
  Texture,
} from "pixi.js";
import { Camera } from "../camera/camera";
import { Container3D } from "../container-3d";
import { Vec3 } from "../math/vec3";
import { Point3D } from "../transform/point";
import { Transform3D } from "../transform/transform-3d";
import type { SpriteBillboardType } from "./sprite-billboard-type";

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

export class Sprite3D extends PerspectiveMesh {
  transform = new Transform3D();

  override get scale() {
    return super.scale;
  }

  override get position() {
    return super.position;
  }

  override get rotation() {
    return super.rotation;
  }

  protected _camera: Camera;
  get camera() {
    return this._camera;
  }

  protected _billboardType: SpriteBillboardType = "none";
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
    0.5,
  );
  get anchor() {
    return this._anchor;
  }
  set anchor(value) {
    this._anchor.copyFrom(value);
  }

  protected _pixelsPerUnit: number;

  constructor(texture: Texture = Texture.WHITE, camera: Camera = Camera.main) {
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

    this._pixelsPerUnit = camera.pixelsPerUnit;

    this._camera.renderer.runners.prerender.add(this);
  }

  override destroy(options?: DestroyOptions): void {
    super.destroy(options);
    this._camera.renderer.runners.prerender.remove(this);
  }

  calculateWorldCorners(
    w: number,
    h: number,
    rotRight: Float32Array,
    rotUp: Float32Array,
    out: Point3D[] = [
      new Point3D(),
      new Point3D(),
      new Point3D(),
      new Point3D(),
    ],
  ) {
    const spritePos = this.transform.worldTransform.position;
    const ax = this._anchor.x;
    const ay = this._anchor.y;

    for (let i = 0; i < 4; i++) {
      const x = cornerOffsets[i]![0]! * w * 0.5 + (0.5 - ax) * w;
      const y = cornerOffsets[i]![1]! * h * 0.5 + (0.5 - ay) * h;
      const worldCorner = out[i]!;

      worldCorner.set(
        spritePos.x + rotRight[0]! * x + rotUp[0]! * y,
        spritePos.y + rotRight[1]! * x + rotUp[1]! * y,
        spritePos.z + rotRight[2]! * x + rotUp[2]! * y,
      );
    }
    return out;
  }

  prerender() {
    this.transform.updateTransform((this.parent as Container3D)?.transform);

    const spritePos = this.transform.worldTransform.position;

    const screenCenter = point;
    this._camera.worldToScreen(
      spritePos.x,
      spritePos.y,
      spritePos.z,
      screenCenter,
    );

    if (Number.isNaN(screenCenter.x) || Number.isNaN(screenCenter.y)) {
      this.visible = false;
      return;
    }

    const viewPos = point;
    this._camera.worldToView(spritePos.x, spritePos.y, spritePos.z, viewPos);
    const depth = -viewPos.z;

    if (depth <= 0) {
      this.visible = false;
      return;
    }

    const w =
      (this.texture.width * this.transform.scale.x) / this._pixelsPerUnit;
    const h =
      (this.texture.height * this.transform.scale.y) / this._pixelsPerUnit;

    let rotRight = Vec3.right;
    let rotUp = Vec3.up;

    if (this._billboardType === "spherical") {
      const view = this._camera.view.array;

      rotRight[0] = view[0]!;
      rotRight[1] = view[4]!;
      rotRight[2] = view[8]!;

      rotUp[0] = view[1]!;
      rotUp[1] = view[5]!;
      rotUp[2] = view[9]!;

      this.calculateWorldCorners(w, h, rotRight, rotUp, worldCorners);
    } else if (this._billboardType === "cylindrical") {
      const view = this._camera.view.array;

      rotRight[0] = view[0]!;
      rotRight[1] = view[4]!;
      rotRight[2] = view[8]!;

      rotUp.set(Vec3.up);

      this.calculateWorldCorners(w, h, rotRight, rotUp, worldCorners);
    } else {
      const ax = this._anchor.x;
      const ay = this._anchor.y;

      for (let i = 0; i < 4; i++) {
        const x = cornerOffsets[i]![0]! * w * 0.5 + (0.5 - ax) * w;
        const y = cornerOffsets[i]![1]! * h * 0.5 + (0.5 - ay) * h;
        this.transform.localToWorld(
          localCorners[i]!.set(x, y, 0),
          worldCorners[i],
        );
      }
    }

    for (let i = 0; i < 4; i++) {
      const worldCorner = worldCorners[i]!;
      this._camera.worldToView(
        worldCorner.x,
        worldCorner.y,
        worldCorner.z,
        viewPos,
      );
      const depth = -viewPos.z;
      if (depth <= 0) {
        this.visible = false;
        return;
      }
    }

    for (let i = 0; i < 4; i++) {
      const worldCorner = worldCorners[i]!;
      this._camera.worldToScreen(
        worldCorner.x,
        worldCorner.y,
        worldCorner.z,
        screenCorners[i],
      );
    }

    this.setCorners(
      screenCorners[3]!.x,
      screenCorners[3]!.y,
      screenCorners[2]!.x,
      screenCorners[2]!.y,
      screenCorners[1]!.x,
      screenCorners[1]!.y,
      screenCorners[0]!.x,
      screenCorners[0]!.y,
    );

    const anchorOffset = point.set(0, h * (0.5 - this._anchor.y), 0);
    this.transform.localToWorld(anchorOffset, anchorOffset);
    this._camera.worldToView(
      anchorOffset.x,
      anchorOffset.y,
      anchorOffset.z,
      viewPos,
    );
    this.zIndex = viewPos.z;

    this.visible = true;
  }
}
