import { IRenderer, MSAA_QUALITY, SCALE_MODES, Texture } from "@pixi/core";
import { Container } from "@pixi/display";
import { AnimatedGraphic } from "../classes/AnimatedGraphic";

export const generateFrameTexture = (
  renderer: IRenderer,
  svg: SVGSVGElement,
  frame: number,
  fps = 60,
  options: {
    quality?: number;
    fillColor?: string | number;
    strokeColor?: string | number;
    strokeWidth?: number;
  } = {}
): Texture => {
  const quality = options?.quality ?? 8;
  const fillColor = options?.fillColor;
  const strokeColor = options?.strokeColor;
  const strokeWidth = options?.strokeWidth;
  const container = new Container();
  const firstFrame = new AnimatedGraphic(svg, {
    fps,
    fillColor,
    strokeColor,
    strokeWidth,
  });
  firstFrame.gotoFrameAndStop(frame);
  container.addChild(firstFrame);
  const renderTexture = renderer?.generateTexture(container, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio * quality,
  });
  return renderTexture;
};
