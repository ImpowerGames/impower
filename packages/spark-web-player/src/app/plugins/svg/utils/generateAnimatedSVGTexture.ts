import { Graphics, GraphicsContext, Rectangle, Renderer } from "pixi.js";
import { AnimatedSVGParser } from "../AnimatedSVGParser";
import { parseSVGViewBoxAttribute } from "./parseSVGViewBoxAttribute";

export const generateAnimatedSVGTexture = (
  renderer: Renderer,
  svg: SVGElement,
  time: number,
  options?: {
    quality?: number;
    scale?: number;
  }
) => {
  const scale = options?.scale ?? 1;
  const quality = options?.quality ?? 4;
  // Create graphicsContext
  const graphicsContext = new GraphicsContext();
  graphicsContext.scale(scale, scale);

  // Create svgContext
  const svgContext = AnimatedSVGParser(svg, graphicsContext, {
    time,
    strokeStyle: {
      scale: scale,
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
