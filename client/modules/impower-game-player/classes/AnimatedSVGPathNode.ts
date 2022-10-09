import { Paint, SVGPathNode, SVGSceneContext } from "@pixi-essentials/svg";
import { Renderer } from "pixi.js";
import { drawSVGGraphics } from "../utils/drawSVGGraphics";
import { getClockValueTime } from "../utils/getClockValueTime";
import { getClosestFractionalIndex } from "../utils/getClosestFractionalIndex";
import { getTweenedValue } from "../utils/getTweenedValue";
import { AnimationControl } from "./AnimationControl";

export class AnimatableSVGPathNode extends SVGPathNode {
  animation?: {
    duration: number;
    repeatLimit?: number;
    keyTimes: number[];
    keySplines: [number, number, number, number][];
    values: string[];
  };

  control?: AnimationControl;

  private _content: SVGSVGElement;

  private _path?: SVGPathElement;

  private _paint?: Paint;

  constructor(
    context: SVGSceneContext,
    control: AnimationControl,
    content: SVGSVGElement,
    pathElement: SVGPathElement,
    animateElement: SVGAnimateElement
  ) {
    super(context);

    this.control = control;
    this._content = content;
    this._path = pathElement;

    if (animateElement) {
      const durAttr = animateElement.getAttribute("dur") || "";
      const repeatCountAttr = animateElement.getAttribute("repeatCount") || "";
      const keyTimesAttr = animateElement.getAttribute("keyTimes") || "";
      const keySplinesAttr = animateElement.getAttribute("keySplines") || "";
      const valuesAttr = animateElement.getAttribute("values") || "";

      if (valuesAttr) {
        const duration = getClockValueTime(durAttr);
        const repeatCount =
          repeatCountAttr === "indefinite"
            ? undefined
            : Number(repeatCountAttr);
        const keyTimes = keyTimesAttr
          .split(";")
          .map((numStr) => Number(numStr));
        const keySplines = keySplinesAttr
          .split(";")
          .map(
            (spline) =>
              spline.split(" ").map((numStr) => Number(numStr)) as [
                number,
                number,
                number,
                number
              ]
          );
        const values = valuesAttr.split(";");
        const d = values?.[0];
        pathElement.setAttribute("d", d);

        this.animation = {
          duration,
          repeatLimit: repeatCount,
          keyTimes,
          keySplines,
          values,
        };
      }
    }
  }

  bindPaint(paint: Paint): void {
    this._paint = paint;
  }

  /**
   * @override
   */
  render(renderer: Renderer): void {
    if (this.animation) {
      this.control.update(performance.now());
      const iterationCount = Math.floor(
        this.control.elapsedDuration / this.animation.duration
      );
      if (
        typeof this.animation.repeatLimit !== "number" ||
        iterationCount <= this.animation.repeatLimit
      ) {
        const normalizedTime =
          this.control.elapsedDuration % this.animation.duration;
        const keyTime = normalizedTime / this.animation.duration;
        const fractionalFrameIndex = getClosestFractionalIndex(
          keyTime,
          this.animation.keyTimes
        );
        const value = getTweenedValue(
          fractionalFrameIndex,
          this.animation.keySplines,
          this.animation.values
        );
        this._path.setAttribute("d", value);
        this.clear();
        if (this._paint) {
          drawSVGGraphics(this._content, this, this._paint);
        }
        try {
          this.embedPath(this._path);
        } catch (e) {
          console.warn(
            "invalid d",
            value,
            normalizedTime,
            fractionalFrameIndex,
            this.animation
          );
        }
      }
    }
    super.render(renderer);
  }
}
