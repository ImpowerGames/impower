import { SparkContext } from "../../../../../spark-engine";
import { SparkPlane, SparkPoint3D } from "../../plugins/projection";
import { Marquee } from "../../plugins/shape-graphics";
import { SparkScene } from "../SparkScene";
import { SparkApplication } from "../wrappers/SparkApplication";

export class PreviewScene extends SparkScene {
  private _marquee: Marquee;

  private _floorPlane = new SparkPlane(new SparkPoint3D(0, 1, 0), 0);

  private _pointerDown = false;

  private _pointerDownX = 0;

  private _pointerDownY = 0;

  private _dragging = false;

  private _dragThreshold = 8;

  constructor(context: SparkContext, app: SparkApplication) {
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

  override start(): void {
    // On press world position
    this.view.addEventListener("pointerdown", (event) => {
      this._pointerDown = true;
      this._dragging = false;
      this._pointerDownX = event.offsetX;
      this._pointerDownY = event.offsetY;
    });
    this.view.addEventListener("pointermove", (event) => {
      if (this._pointerDown) {
        const pointerX = event.offsetX;
        const pointerY = event.offsetY;
        const dragDistance =
          (pointerX - this._pointerDownX) ** 2 +
          (pointerY - this._pointerDownY) ** 2;
        if (dragDistance > this._dragThreshold) {
          this._dragging = true;
        }
      }
    });
    this.view.addEventListener("pointerup", (event) => {
      const pointerX = event.offsetX;
      const pointerY = event.offsetY;
      if (this._pointerDown && !this._dragging) {
        const ray = this.dolly.camera.screenToRay(pointerX, pointerY);
        const distance = this._floorPlane.rayCast(ray);
        const point = ray.getPoint(distance);
        if (point) {
          console.warn("CLICKED: ", point.x, point.y, point.z);
        }
      }
      this._pointerDown = false;
      this._dragging = false;
    });
  }
}
