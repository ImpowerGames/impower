import { Paint, SVGGraphicsNode } from "@pixi-essentials/svg";
import { LINE_CAP, LINE_JOIN, Matrix, Texture } from "pixi.js";
import { createPaintServer } from "./createPaintServer";
import { parseReference } from "./parseReference";

export const drawSVGGraphics = (
  content: SVGSVGElement,
  node: SVGGraphicsNode,
  paint: Paint
): void => {
  const {
    fill,
    opacity,
    stroke,
    strokeDashArray,
    strokeDashOffset,
    strokeLineCap,
    strokeLineJoin,
    strokeMiterLimit,
    strokeWidth,
  } = paint;

  if (fill === "none") {
    node.beginFill(0, 0);
  } else if (typeof fill === "number") {
    node.beginFill(fill, opacity === null ? 1 : opacity);
  } else if (!fill) {
    node.beginFill(0);
  } else {
    const ref = parseReference(fill);
    const paintElement = content.querySelector(ref);

    if (paintElement && paintElement instanceof SVGGradientElement) {
      const paintServer = createPaintServer(paintElement);
      const { paintTexture } = paintServer;

      node.paintServers.push(paintServer);
      node.beginTextureFill({
        texture: paintTexture,
        alpha: opacity === null ? 1 : opacity,
        matrix: new Matrix(),
      });
    }
  }

  let strokeTexture: Texture;

  if (typeof stroke === "string" && stroke.startsWith("url")) {
    const ref = parseReference(stroke);
    const paintElement = content.querySelector(ref);

    if (paintElement && paintElement instanceof SVGGradientElement) {
      const paintServer = createPaintServer(paintElement);
      const { paintTexture } = paintServer;

      node.paintServers.push(paintServer);
      strokeTexture = paintTexture;
    }
  }

  node.lineTextureStyle({
    color: stroke === null ? 0 : typeof stroke === "number" ? stroke : 0xffffff,
    cap:
      strokeLineCap === null
        ? LINE_CAP.SQUARE
        : (strokeLineCap as unknown as LINE_CAP),
    dashArray: strokeDashArray,
    dashOffset: strokeDashOffset === null ? strokeDashOffset : 0,
    join:
      strokeLineJoin === null
        ? LINE_JOIN.MITER
        : (strokeLineJoin as unknown as LINE_JOIN),
    matrix: new Matrix(),
    miterLimit: strokeMiterLimit === null ? 150 : strokeMiterLimit,
    texture: strokeTexture || Texture.WHITE,
    width:
      strokeWidth === null ? (typeof stroke === "number" ? 1 : 0) : strokeWidth,
  });
};
