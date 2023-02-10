import { IRenderer, MSAA_QUALITY, SCALE_MODES, Texture } from "@pixi/core";
import { Container } from "@pixi/display";
import { ISpritesheetData, Spritesheet } from "@pixi/spritesheet";
import { AnimatedGraphic } from "../classes/AnimatedGraphic";

export const generateSpritesheet = (
  renderer: IRenderer,
  svg: SVGSVGElement,
  fps = 60,
  id = "",
  animationName = "default",
  options: { quality?: number } = {}
): Spritesheet => {
  const quality = options?.quality ?? 8;
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
  const frameCount = Math.floor(duration / secondsPerFrame);
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
  let time = 0;
  let x = 0;
  let y = 0;
  if (frameCount <= 1) {
    const frameId = id + time;
    atlasData.frames[frameId] = {
      frame: {
        x,
        y,
        w,
        h,
      },
      sourceSize: { w, h },
      spriteSourceSize: { x: 1, y: 1 },
    };
    atlasData.animations?.[animationName]?.push(frameId);
  } else {
    const columns = Math.sqrt(frameCount);
    const rows = Math.ceil(frameCount / columns);
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
  }
  const renderTexture = renderer?.generateTexture(container, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio * quality,
  });
  return new Spritesheet(renderTexture || Texture.EMPTY, atlasData);
};
