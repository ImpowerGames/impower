import {
  FILL_RULE,
  Paint,
  Path,
  SVGGraphicsNode,
  SVGSceneContext,
} from "@pixi-essentials/svg";
import { IShape, Renderer } from "@pixi/core";
import { PathCommand } from "../../path/types/Path";
import { absolutizePath } from "../../path/utils/absolutizePath";
import { normalizePath } from "../../path/utils/normalizePath";
import { parsePath } from "../../path/utils/parsePath";
import { drawSVGGraphics } from "../utils/drawSVGGraphics";
import { getClockValueTime } from "../utils/getClockValueTime";
import { getClosestFractionalIndex } from "../utils/getClosestFractionalIndex";
import { getTweenedPathCommands } from "../utils/getTweenedPathCommands";
import { AnimationControl } from "./AnimationControl";

const getPathCommands = (d: string): PathCommand[] =>
  normalizePath(absolutizePath(parsePath(d)));

export class AnimatedSVGPathNode extends SVGGraphicsNode {
  public control: AnimationControl;

  protected _animation?: {
    duration: number;
    repeatLimit?: number;
    keyTimes: number[];
    keySplines: [number, number, number, number][];
    commands: PathCommand[][];
  };

  protected _fillRule: FILL_RULE = FILL_RULE.NONZERO;

  protected _content: SVGSVGElement;

  protected _paint?: Paint;

  protected _lastFractionalFrameIndex?: number;

  protected _currentPath?: Path;

  // @ts-expect-error override behavior
  get currentPath(): Polygon {
    return this._currentPath;
  }

  // @ts-expect-error override behavior
  set currentPath(nothing: Polygon) {
    if (nothing) {
      throw new Error("currentPath cannot be set");
    }
    // readonly
  }

  constructor(
    context: SVGSceneContext,
    control: AnimationControl,
    content: SVGSVGElement,
    pathElement: SVGPathElement,
    animateElement: SVGAnimateElement
  ) {
    super(context);

    this._fillRule = pathElement.getAttribute("fill-rule") as FILL_RULE;
    this._content = content;

    if (animateElement) {
      const durAttr = animateElement.getAttribute("dur") || "";
      const repeatCountAttr = animateElement.getAttribute("repeatCount") || "";
      const keyTimesAttr = animateElement.getAttribute("keyTimes") || "";
      const keySplinesAttr = animateElement.getAttribute("keySplines") || "";
      const valuesAttr = animateElement.getAttribute("values") || "";

      if (valuesAttr) {
        const values = valuesAttr.split(";");
        const duration = getClockValueTime(durAttr);
        const repeatLimit =
          !repeatCountAttr || repeatCountAttr === "indefinite"
            ? undefined
            : Number(repeatCountAttr);
        const keyTimes = keyTimesAttr
          ? keyTimesAttr.split(";").map((numStr) => Number(numStr))
          : values.map((_, i) => i / values.length);
        const keySplines = keySplinesAttr
          ? keySplinesAttr
              .split(";")
              .map(
                (spline) =>
                  spline.split(" ").map((numStr) => Number(numStr)) as [
                    number,
                    number,
                    number,
                    number
                  ]
              )
          : values.map(() => [0, 0, 1, 1] as [number, number, number, number]);
        const commands = values.map((x) => getPathCommands(x));

        this._animation = {
          duration,
          repeatLimit,
          keyTimes,
          keySplines,
          commands,
        };
      }
    } else {
      this._animation = {
        duration: 0,
        repeatLimit: 1,
        keyTimes: [0],
        keySplines: [],
        commands: [getPathCommands(pathElement.getAttribute("d") || "")],
      };
    }

    this.control = control;
    this.control.animationDuration = Math.max(
      this.control?.animationDuration || 0,
      this._animation?.duration || 0
    );
  }

  bindPaint(paint: Paint | undefined): void {
    this._paint = paint;
  }

  private startPath(): void {
    if (this._currentPath) {
      const pts = this._currentPath.points;

      if (pts.length > 0) {
        this._currentPath.closeContour();
      }
    } else {
      this._currentPath = new Path();
    }
  }

  private finishPath(): void {
    if (this._currentPath) {
      this._currentPath.closeContour();
    }
  }

  override closePath(): this {
    if (this._currentPath) {
      this._currentPath.points.push(
        this._currentPath.points[0] || 0,
        this._currentPath.points[1] || 0
      );
    }
    this.finishPath();

    return this;
  }

  checkPath(): void {
    if (this._currentPath) {
      if (this._currentPath.points.find((e) => Number.isNaN(e)) !== undefined) {
        throw new Error("NaN is bad");
      }
    }
  }

  /**
   * @override
   *
   * Embeds the `SVGPathElement` into this node.
   *
   * @param path - the path element or path commands to draw
   */
  embedPath(path: SVGPathElement | PathCommand[]): this {
    const commands = Array.isArray(path)
      ? path
      : this._animation?.commands?.[0] ||
        getPathCommands(path.getAttribute("d") || "");

    for (let i = 0, j = commands.length; i < j; i += 1) {
      const command = commands[i];

      if (!command) {
        break;
      }

      const d = command.data;
      switch (command.command) {
        case "M": {
          this.moveTo(d[0] || 0, d[1] || 0);
          break;
        }
        case "C": {
          this.bezierCurveTo(
            d[0] || 0,
            d[1] || 0,
            d[2] || 0,
            d[3] || 0,
            d[4] || 0,
            d[5] || 0
          );
          break;
        }
        case "Z": {
          this.closePath();
          break;
        }
        default: {
          console.warn("Draw command not supported:", command.command, command);
          break;
        }
      }
    }

    if (this._currentPath) {
      this._currentPath.fillRule = this._fillRule || this._currentPath.fillRule;
      this.drawShape(this._currentPath as unknown as IShape);
      this._currentPath = undefined;
    }

    return this;
  }

  override render(renderer: Renderer): void {
    if (this._animation?.duration) {
      const currentIteration = Math.floor(
        this.control.time / this._animation.duration
      );
      if (
        !this._animation?.repeatLimit ||
        currentIteration <= this._animation?.repeatLimit
      ) {
        const keyTime = this.control.time / this._animation.duration;
        const fractionalFrameIndex = getClosestFractionalIndex(
          keyTime,
          this._animation.keyTimes
        );
        if (fractionalFrameIndex !== this._lastFractionalFrameIndex) {
          this._lastFractionalFrameIndex = fractionalFrameIndex;
          this.clear();
          if (this._paint) {
            drawSVGGraphics(this._content, this, this._paint);
          }
          const tweenedCommands = getTweenedPathCommands(
            fractionalFrameIndex,
            this._animation.keySplines,
            this._animation.commands
          );
          this.embedPath(tweenedCommands);
        }
      }
    }
    super.render(renderer);
  }

  override startPoly = this.startPath;

  override finishPoly = this.finishPath;
}
