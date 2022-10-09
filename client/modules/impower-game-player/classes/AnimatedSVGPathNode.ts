import {
  FILL_RULE,
  Paint,
  Path,
  SVGGraphicsNode,
  SVGSceneContext,
} from "@pixi-essentials/svg";
import { IShape, Renderer } from "pixi.js";
import { drawSVGGraphics } from "../utils/drawSVGGraphics";
import { getClockValueTime } from "../utils/getClockValueTime";
import { getClosestFractionalIndex } from "../utils/getClosestFractionalIndex";
import { getTweenedPathCommands } from "../utils/getTweenedPathCommands";
import { PathCommand, pathCommandsFromString } from "../utils/interpolatePath";
import { isRelativePathCommand } from "../utils/isRelativePathCommand";
import { AnimationControl } from "./AnimationControl";

export class AnimatableSVGPathNode extends SVGGraphicsNode {
  fillRule: FILL_RULE;

  animation?: {
    duration: number;
    repeatLimit?: number;
    keyTimes: number[];
    keySplines: [number, number, number, number][];
    commands: PathCommand[][];
  };

  control?: AnimationControl;

  private _content: SVGSVGElement;

  private _paint?: Paint;

  private currentPath2: Path;

  // @ts-expect-error override behavior
  get currentPath(): Polygon {
    return this.currentPath2;
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

    this.fillRule = pathElement.getAttribute("fill-rule") as FILL_RULE;
    this.control = control;
    this._content = content;

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
        const commands = values.map((x) => pathCommandsFromString(x));

        this.animation = {
          duration,
          repeatLimit: repeatCount,
          keyTimes,
          keySplines,
          commands,
        };
      }
    } else {
      this.animation = {
        duration: 0,
        repeatLimit: 1,
        keyTimes: [0],
        keySplines: [],
        commands: [pathCommandsFromString(pathElement.getAttribute("d"))],
      };
    }
  }

  bindPaint(paint: Paint): void {
    this._paint = paint;
  }

  private startPath(): void {
    if (this.currentPath2) {
      const pts = this.currentPath2.points;

      if (pts.length > 0) {
        this.currentPath2.closeContour();
      }
    } else {
      this.currentPath2 = new Path();
    }
  }

  private finishPath(): void {
    if (this.currentPath2) {
      this.currentPath2.closeContour();
    }
  }

  closePath(): this {
    this.currentPath2.points.push(
      this.currentPath2.points[0],
      this.currentPath2.points[1]
    );
    this.finishPath();

    return this;
  }

  checkPath(): void {
    if (this.currentPath2.points.find((e) => Number.isNaN(e)) !== undefined) {
      throw new Error("NaN is bad");
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
      : this.animation?.commands?.[0] ||
        pathCommandsFromString(path.getAttribute("d"));

    // Current point
    let x = 0;
    let y = 0;

    for (let i = 0, j = commands.length; i < j; i += 1) {
      const lastCommand = commands[i - 1];
      const command = commands[i];

      if (Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error("Data corruption");
      }

      // Taken from: https://github.com/bigtimebuddy/pixi-svg/blob/main/src/SVG.ts
      // Copyright Matt Karl
      switch (command.type) {
        case "m": {
          this.moveTo((x += command.x), (y += command.y));
          break;
        }
        case "M": {
          this.moveTo((x = command.x), (y = command.y));
          break;
        }
        case "H": {
          this.lineTo((x = command.x), y);
          break;
        }
        case "h": {
          this.lineTo((x += command.x), y);
          break;
        }
        case "V": {
          this.lineTo(x, (y = command.y));
          break;
        }
        case "v": {
          this.lineTo(x, (y += command.y));
          break;
        }
        case "z":
        case "Z": {
          x = this.currentPath2?.points[0] || 0;
          y = this.currentPath2?.points[1] || 0;
          this.closePath();
          break;
        }
        case "L": {
          this.lineTo((x = command.x), (y = command.y));
          break;
        }
        case "l": {
          this.lineTo((x += command.x), (y += command.y));
          break;
        }
        case "C": {
          this.bezierCurveTo(
            command.x1,
            command.y1,
            command.x2,
            command.y2,
            (x = command.x),
            (y = command.y)
          );
          break;
        }
        case "c": {
          const currX = x;
          const currY = y;

          this.bezierCurveTo(
            currX + command.x1,
            currY + command.y1,
            currX + command.x2,
            currY + command.y2,
            (x += command.x),
            (y += command.y)
          );
          break;
        }
        case "s":
        case "S": {
          let cp1X = x;
          let cp1Y = y;
          const lastCode = commands[i - 1] ? commands[i - 1].type : null;

          if (
            i > 0 &&
            (lastCode === "s" ||
              lastCode === "S" ||
              lastCode === "c" ||
              lastCode === "C")
          ) {
            const lastCommand = commands[i - 1];
            let lastCp2X = lastCommand.x2 || lastCommand.x;
            let lastCp2Y = lastCommand.y2 || lastCommand.y;
            if (isRelativePathCommand(commands[i - 1])) {
              lastCp2X += x - lastCommand.x;
              lastCp2Y += y - lastCommand.y;
            }

            cp1X = 2 * x - lastCp2X;
            cp1Y = 2 * y - lastCp2Y;
          }

          let cp2X = command.x;
          let cp2Y = command.y;

          if (isRelativePathCommand(command)) {
            cp2X += x;
            cp2Y += y;

            x += command.x;
            y += command.y;
          } else {
            x = command.x;
            y = command.y;
          }

          this.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, x, y);

          break;
        }
        case "q": {
          const currX = x;
          const currY = y;

          this.quadraticCurveTo(
            currX + command.x,
            currY + command.y,
            (x += command.x),
            (y += command.y)
          );
          break;
        }
        case "Q": {
          this.quadraticCurveTo(
            command.x,
            command.y,
            (x = command.x),
            (y = command.y)
          );
          break;
        }
        case "A":
          this.ellipticArcTo(
            (x = command.x),
            (y = command.y),
            command.rx,
            command.ry,
            ((command.xAxisRotation || 0) * Math.PI) / 180,
            !command.sweepFlag,
            Boolean(command.largeArcFlag)
          );
          break;
        case "a":
          this.ellipticArcTo(
            (x += command.x),
            (y += command.y),
            command.rx,
            command.ry,
            ((command.xAxisRotation || 0) * Math.PI) / 180,
            !command.sweepFlag,
            Boolean(command.largeArcFlag)
          );

          break;
        case "t":
        case "T": {
          let cx: number;
          let cy: number;

          if (lastCommand) {
            let lcx = lastCommand.x;
            let lcy = lastCommand.y;

            if (isRelativePathCommand(lastCommand)) {
              const lx = x - lastCommand.x;
              const ly = y - lastCommand.y;

              lcx += lx;
              lcy += ly;
            }

            cx = 2 * x - lcx;
            cy = 2 * y - lcy;
          } else {
            cx = x;
            cy = y;
          }

          if (command.type === "t") {
            this.quadraticCurveTo(cx, cy, (x += command.x), (y += command.y));
          } else {
            this.quadraticCurveTo(cx, cy, (x = command.x), (y = command.y));
          }

          break;
        }
        default: {
          console.warn(
            "[PIXI.SVG] Draw command not supported:",
            command.type,
            command
          );
          break;
        }
      }
    }

    if (this.currentPath2) {
      this.currentPath2.fillRule = this.fillRule || this.currentPath2.fillRule;
      this.drawShape(this.currentPath2 as unknown as IShape);
      this.currentPath2 = null;
    }

    return this;
  }

  /**
   * @override
   */
  render(renderer: Renderer): void {
    if (this.animation?.duration) {
      this.control.update(performance.now());
      const iterationCount = Math.floor(
        this.control.elapsedDuration / this.animation.duration
      );
      if (
        typeof this.animation.repeatLimit !== "number" ||
        iterationCount <= this.animation.repeatLimit
      ) {
        this.clear();
        if (this._paint) {
          drawSVGGraphics(this._content, this, this._paint);
        }
        const normalizedTime =
          this.control.elapsedDuration % this.animation.duration;
        const keyTime = normalizedTime / this.animation.duration;
        const fractionalFrameIndex = getClosestFractionalIndex(
          keyTime,
          this.animation.keyTimes
        );
        const tweenedCommands = getTweenedPathCommands(
          fractionalFrameIndex,
          this.animation.keySplines,
          this.animation.commands
        );
        this.embedPath(tweenedCommands);
      }
    }
    super.render(renderer);
  }

  startPoly = this.startPath;

  finishPoly = this.finishPath;
}
