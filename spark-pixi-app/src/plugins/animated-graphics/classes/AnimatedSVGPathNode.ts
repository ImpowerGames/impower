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

export class AnimatedSVGPathNode extends SVGGraphicsNode {
  public control: AnimationControl;

  protected _animation?: {
    duration: number;
    repeatLimit?: number;
    keyTimes: number[];
    keySplines: [number, number, number, number][];
    commands: PathCommand[][];
  };

  protected _fillRule: FILL_RULE;

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
        const duration = getClockValueTime(durAttr); // in ms
        const repeatLimit =
          !repeatCountAttr || repeatCountAttr === "indefinite"
            ? undefined
            : Number(repeatCountAttr);
        const keyTimes = keyTimesAttr
          .split(";")
          .map((numStr) => Number(numStr)); // percentage of duration
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
        commands: [pathCommandsFromString(pathElement.getAttribute("d") || "")],
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
        pathCommandsFromString(path.getAttribute("d") || "");

    // Current point
    let x = 0;
    let y = 0;

    for (let i = 0, j = commands.length; i < j; i += 1) {
      const lastCommand = commands[i - 1];
      const command = commands[i];

      if (Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error("Data corruption");
      }

      if (!command) {
        break;
      }

      // Taken from: https://github.com/bigtimebuddy/pixi-svg/blob/main/src/SVG.ts
      // Copyright Matt Karl
      switch (command.type) {
        case "m": {
          this.moveTo((x += command.x || 0), (y += command.y || 0));
          break;
        }
        case "M": {
          this.moveTo((x = command.x || 0), (y = command.y || 0));
          break;
        }
        case "H": {
          this.lineTo((x = command.x || 0), y);
          break;
        }
        case "h": {
          this.lineTo((x += command.x || 0), y);
          break;
        }
        case "V": {
          this.lineTo(x, (y = command.y || 0));
          break;
        }
        case "v": {
          this.lineTo(x, (y += command.y || 0));
          break;
        }
        case "z":
        case "Z": {
          x = this._currentPath?.points[0] || 0;
          y = this._currentPath?.points[1] || 0;
          this.closePath();
          break;
        }
        case "L": {
          this.lineTo((x = command.x || 0), (y = command.y || 0));
          break;
        }
        case "l": {
          this.lineTo((x += command.x || 0), (y += command.y || 0));
          break;
        }
        case "C": {
          this.bezierCurveTo(
            command.x1 || 0,
            command.y1 || 0,
            command.x2 || 0,
            command.y2 || 0,
            (x = command.x || 0),
            (y = command.y || 0)
          );
          break;
        }
        case "c": {
          const currX = x;
          const currY = y;

          this.bezierCurveTo(
            currX + (command.x1 || 0),
            currY + (command.y1 || 0),
            currX + (command.x2 || 0),
            currY + (command.y2 || 0),
            (x += command.x || 0),
            (y += command.y || 0)
          );
          break;
        }
        case "s":
        case "S": {
          const lastCommand = commands[i - 1];
          let cp1X = x;
          let cp1Y = y;
          const lastCode = lastCommand ? lastCommand.type : null;

          if (
            i > 0 &&
            (lastCode === "s" ||
              lastCode === "S" ||
              lastCode === "c" ||
              lastCode === "C")
          ) {
            if (lastCommand) {
              let lastCp2X = lastCommand.x2 || lastCommand.x || 0;
              let lastCp2Y = lastCommand.y2 || lastCommand.y || 0;
              if (isRelativePathCommand(lastCommand)) {
                lastCp2X += x - (lastCommand.x || 0);
                lastCp2Y += y - (lastCommand.y || 0);
              }
              cp1X = 2 * x - lastCp2X;
              cp1Y = 2 * y - lastCp2Y;
            }
          }

          let cp2X = command.x || 0;
          let cp2Y = command.y || 0;

          if (isRelativePathCommand(command)) {
            cp2X += x || 0;
            cp2Y += y || 0;

            x += command.x || 0;
            y += command.y || 0;
          } else {
            x = command.x || 0;
            y = command.y || 0;
          }

          this.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, x, y);

          break;
        }
        case "q": {
          const currX = x;
          const currY = y;

          this.quadraticCurveTo(
            currX + (command.x || 0),
            currY + (command.y || 0),
            (x += command.x || 0),
            (y += command.y || 0)
          );
          break;
        }
        case "Q": {
          this.quadraticCurveTo(
            command.x || 0,
            command.y || 0,
            (x = command.x || 0),
            (y = command.y || 0)
          );
          break;
        }
        case "A":
          this.ellipticArcTo(
            (x = command.x || 0),
            (y = command.y || 0),
            command.rx || 0,
            command.ry || 0,
            ((command.xAxisRotation || 0) * Math.PI) / 180,
            !command.sweepFlag,
            Boolean(command.largeArcFlag)
          );
          break;
        case "a":
          this.ellipticArcTo(
            (x += command.x || 0),
            (y += command.y || 0),
            command.rx || 0,
            command.ry || 0,
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
            let lcx = lastCommand.x || 0;
            let lcy = lastCommand.y || 0;

            if (isRelativePathCommand(lastCommand)) {
              const lx = x - (lastCommand.x || 0);
              const ly = y - (lastCommand.y || 0);

              lcx += lx || 0;
              lcy += ly || 0;
            }

            cx = 2 * x - lcx;
            cy = 2 * y - lcy;
          } else {
            cx = x;
            cy = y;
          }

          if (command.type === "t") {
            this.quadraticCurveTo(
              cx,
              cy,
              (x += command.x || 0),
              (y += command.y || 0)
            );
          } else {
            this.quadraticCurveTo(
              cx,
              cy,
              (x = command.x || 0),
              (y = command.y || 0)
            );
          }

          break;
        }
        default: {
          console.warn("Draw command not supported:", command.type, command);
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
