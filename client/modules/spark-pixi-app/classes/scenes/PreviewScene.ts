import { SparkContext } from "../../../../../spark-engine";
import { Application } from "../../plugins/app";
import { Marquee } from "../../plugins/graphics";
import { Plane, Point3D } from "../../plugins/projection";
import { SparkScene } from "../SparkScene";

export class PreviewScene extends SparkScene {
  private _marquee: Marquee;

  private _floorPlane = new Plane(new Point3D(0, 1, 0), 0);

  constructor(context: SparkContext, app: Application) {
    super(context, app);
    this._marquee = new Marquee({
      dash: 4,
      dashSpace: 4,
      thickness: 1,
      speed: 0.4,
      fillStyle: "blue",
    });
    this._marquee.alpha = 0.8;
    this._marquee.visible = false;
  }

  override onTap(event: PointerEvent): void {
    const pointerX = event.offsetX;
    const pointerY = event.offsetY;
    if (this.pointerDown && !this.dragging) {
      const ray = this.dolly.camera.screenToRay(pointerX, pointerY);
      const distance = this._floorPlane.rayCast(ray);
      const point = ray.getPoint(distance);
      if (point) {
        console.warn("CLICKED: ", point.x, point.y, point.z);
      }
    }
  }
}
