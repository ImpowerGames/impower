import * as PIXI from "pixi.js";
import { AnimatedGraphic } from "../classes/AnimatedGraphic";

export const generateSpritesheet = (
  svg: SVGSVGElement,
  renderer: PIXI.AbstractRenderer,
  maxFPS = 60,
  id: string,
  animationName = "default"
): PIXI.Spritesheet => {
  const container = new PIXI.Container();
  const firstFrame = new AnimatedGraphic(svg, {
    autoUpdate: false,
    time: 0,
    maxFPS,
  });
  firstFrame.gotoAndStop(0);
  container.addChild(firstFrame);
  const w = firstFrame.width;
  const h = firstFrame.height;
  const duration = firstFrame.animationDuration;
  const sampleRate = 1000 / maxFPS;
  const atlasData: PIXI.ISpritesheetData = {
    frames: {},
    meta: {
      scale: String(1),
      related_multi_packs: [],
    },
    animations: {
      [animationName]: [],
    },
  };
  const frameCount = Math.floor(duration / sampleRate);
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
        autoUpdate: false,
        time,
        maxFPS,
      });
      frame.gotoAndStop(time);
      frame.position.set(x, y);
      container.addChild(frame);
      const frameId = id + time;
      atlasData.frames[frameId] = {
        frame: { x, y, w, h },
        sourceSize: { w, h },
        spriteSourceSize: { x: 0, y: 0 },
      };
      atlasData.animations[animationName].push(frameId);
      time += sampleRate;
      x += w;
    }
    x = 0;
    y += h;
  }
  const renderTexture = renderer.generateTexture(container);
  return new PIXI.Spritesheet(renderTexture, atlasData);
};
