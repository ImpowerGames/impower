import {
  Container,
  IRenderer,
  ISpritesheetData,
  MSAA_QUALITY,
  SCALE_MODES,
  Spritesheet,
  Texture,
} from "pixi.js";
import { AnimatedGraphic } from "../classes/AnimatedGraphic";

export const generateSpritesheet = (
  renderer: IRenderer,
  svg: SVGSVGElement,
  fps = 60,
  id = "",
  animationName = "default",
  quality = 8
): Spritesheet => {
  const container = new Container();
  const firstFrame = new AnimatedGraphic(svg, {
    fps,
  });
  firstFrame.gotoTimeAndStop(0);
  container.addChild(firstFrame);
  const w = firstFrame.width;
  const h = firstFrame.height;
  const duration = firstFrame.animationDuration;
  const secondsPerFrame = 1 / fps;
  const atlasData: ISpritesheetData = {
    frames: {},
    meta: {
      scale: String(1),
      related_multi_packs: [],
    },
    animations: {
      [animationName]: [],
    },
  };
  const frameCount = Math.floor(duration / secondsPerFrame);
  const columns = Math.sqrt(frameCount);
  const rows = Math.ceil(frameCount / columns);
  let time = 0;
  let x = 0;
  let y = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      if (time > duration) {
        break;
      }
      const frame = new AnimatedGraphic(svg, {
        time,
        fps,
      });
      frame.gotoTimeAndStop(time);
      frame.position.set(x, y);
      container.addChild(frame);
      const frameId = id + time;
      // To prevent bleeding between frames when anti-aliasing texture
      const spacing = 1;
      atlasData.frames[frameId] = {
        frame: {
          x: x + spacing,
          y: y + spacing,
          w: w - spacing,
          h: h - spacing,
        },
        sourceSize: { w: w - spacing, h: h - spacing },
        spriteSourceSize: { x: 1, y: 1 },
      };
      atlasData.animations?.[animationName]?.push(frameId);
      time += secondsPerFrame;
      x += w;
    }
    x = 0;
    y += h;
  }
  const renderTexture = renderer?.generateTexture(container, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio * quality,
  });
  return new Spritesheet(renderTexture || Texture.EMPTY, atlasData);
};
