import { PaintServer } from "@pixi-essentials/svg";
import { RenderTexture } from "pixi.js";

/**
 * Creates a lazy paint texture for the paint server.
 *
 * @alpha
 * @param paintServer - The paint server to be rendered.
 */
export const createPaintServer = (
  paintServer: SVGGradientElement
): PaintServer => {
  const renderTexture = RenderTexture.create({
    width: 128,
    height: 128,
  });

  return new PaintServer(paintServer, renderTexture);
};
