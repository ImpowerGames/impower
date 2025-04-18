import { Graphics, GraphicsContext, Rectangle, Renderer } from "pixi.js";
import {
  AnimatedSVGParser,
  AnimatedSVGParserOptions,
} from "../AnimatedSVGParser";
import { parseSVGViewBoxAttribute } from "./parseSVGViewBoxAttribute";

export interface GenerateAnimatedSVGTextureOptions
  extends AnimatedSVGParserOptions {
  quality?: number;
  scale?: number;
}

export const generateAnimatedSVGTexture = (
  renderer: Renderer,
  svg: SVGElement,
  time: number,
  options?: GenerateAnimatedSVGTextureOptions
) => {
  const { scale = 1, quality = 4, ...rest } = options || {};
  // Create graphicsContext
  const graphicsContext = new GraphicsContext();
  graphicsContext.scale(scale, scale);

  // Create svgContext
  const svgContext = AnimatedSVGParser(svg, graphicsContext, {
    ...(rest || {}),
    time,
    strokeStyle: {
      scale,
      ...(rest.strokeStyle || {}),
    },
  });

  // Create graphic
  const graphic = new Graphics(svgContext);

  // Render the graphic to a texture
  const dimensions = parseSVGViewBoxAttribute(svg);
  const renderTexture = renderer?.generateTexture({
    target: graphic,
    antialias: true,
    resolution: renderer.resolution * quality,
    frame: new Rectangle(
      0,
      0,
      dimensions.width * scale,
      dimensions.height * scale
    ),
  });
  return renderTexture;
};
