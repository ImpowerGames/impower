/*
 * Based on pixijs AnimatedSprite
 * <https://github.com/pixijs/pixijs/blob/dev/src/scene/sprite-animated/AnimatedSprite.ts>
 *
 * Copyright (c) 2013-2023 Mathew Groves, Chad Engler
 * Released under the MIT license.
 */

import {
  type AnimatedSpriteFrames,
  type AnimatedSpriteOptions,
  type FrameObject,
  Texture,
  Ticker,
  UPDATE_PRIORITY,
} from "pixi.js";
import { Camera } from "../camera/camera";
import { Sprite3D } from "./sprite-3d";

export class AnimatedSprite3D extends Sprite3D {
  public animationSpeed: number;

  public loop: boolean;

  public updateAnchor: boolean;

  public onComplete?: (() => void) | null;

  public onFrameChange?: ((currentFrame: number) => void) | null;

  public onLoop?: (() => void) | null;

  private _playing: boolean;
  private _textures: Texture[] | null;
  private _durations: number[] | null;

  private _autoUpdate: boolean;

  private _isConnectedToTicker: boolean;

  private _currentTime: number;

  private _previousFrame: number | null;

  constructor(frames: AnimatedSpriteFrames, camera?: Camera);
  constructor(options: AnimatedSpriteOptions);
  constructor(
    ...args:
      | [AnimatedSpriteOptions?, Camera?]
      | [AnimatedSpriteFrames?, Camera?]
  ) {
    let options = args[0] as AnimatedSpriteOptions;

    if (Array.isArray(args[0])) {
      options = {
        textures: args[0] as AnimatedSpriteFrames,
      };
    }

    const camera = args[1] || Camera.main;

    const {
      animationSpeed = 1,
      autoPlay = false,
      autoUpdate = true,
      loop = true,
      onComplete = null,
      onFrameChange = null,
      onLoop = null,
      textures,
      updateAnchor = false,
    } = options;
    const [firstFrame] = textures;

    super(
      firstFrame instanceof Texture ? firstFrame : firstFrame!.texture,
      camera,
    );

    this._textures = null;
    this._durations = null;
    this._autoUpdate = autoUpdate;
    this._isConnectedToTicker = false;

    this.animationSpeed = animationSpeed;
    this.loop = loop;
    this.updateAnchor = updateAnchor;
    this.onComplete = onComplete;
    this.onFrameChange = onFrameChange;
    this.onLoop = onLoop;

    this._currentTime = 0;

    this._playing = false;
    this._previousFrame = null;

    this.textures = textures;

    if (autoPlay) {
      this.play();
    }
  }

  public stop(): void {
    if (!this._playing) {
      return;
    }

    this._playing = false;
    if (this._autoUpdate && this._isConnectedToTicker) {
      Ticker.shared.remove(this.update, this);
      this._isConnectedToTicker = false;
    }
  }

  public play(): void {
    if (this._playing) {
      return;
    }

    this._playing = true;
    if (this._autoUpdate && !this._isConnectedToTicker) {
      Ticker.shared.add(this.update, this, UPDATE_PRIORITY.HIGH);
      this._isConnectedToTicker = true;
    }
  }

  public gotoAndStop(frameNumber: number): void {
    this.stop();
    this.currentFrame = frameNumber;
  }

  public gotoAndPlay(frameNumber: number): void {
    this.currentFrame = frameNumber;
    this.play();
  }

  public tick(deltaTime: number): void {
    const elapsed = this.animationSpeed * deltaTime;
    const previousFrame = this.currentFrame;

    if (this._durations !== null) {
      let lag = (this._currentTime % 1) * this._durations[this.currentFrame]!;

      lag += (elapsed / 60) * 1000;

      while (lag < 0) {
        this._currentTime--;
        lag += this._durations[this.currentFrame]!;
      }

      const sign = Math.sign(this.animationSpeed * deltaTime);

      this._currentTime = Math.floor(this._currentTime);

      while (lag >= this._durations[this.currentFrame]!) {
        lag -= this._durations[this.currentFrame]! * sign;
        this._currentTime += sign;
      }

      this._currentTime += lag / this._durations[this.currentFrame]!;
    } else {
      this._currentTime += elapsed;
    }

    if (this._currentTime < 0 && !this.loop) {
      this.gotoAndStop(0);

      if (this.onComplete) {
        this.onComplete();
      }
    } else if (this._currentTime >= this._textures!.length && !this.loop) {
      this.gotoAndStop(this._textures!.length - 1);

      if (this.onComplete) {
        this.onComplete();
      }
    } else if (previousFrame !== this.currentFrame) {
      if (this.loop && this.onLoop) {
        if (
          (this.animationSpeed > 0 && this.currentFrame < previousFrame) ||
          (this.animationSpeed < 0 && this.currentFrame > previousFrame)
        ) {
          this.onLoop();
        }
      }

      this._updateTexture();
    }
  }

  public update(ticker: Ticker): void {
    if (!this._playing) {
      return;
    }
    this.update(ticker);
  }

  private _updateTexture(): void {
    const currentFrame = this.currentFrame;

    if (this._previousFrame === currentFrame) {
      return;
    }

    this._previousFrame = currentFrame;

    this.texture = this._textures![currentFrame]!;

    if (this.updateAnchor && this.texture.defaultAnchor) {
      this.anchor.copyFrom(this.texture.defaultAnchor);
    }

    if (this.onFrameChange) {
      this.onFrameChange(this.currentFrame);
    }
  }

  public override destroy(): void {
    this.stop();
    super.destroy();

    this.onComplete = null;
    this.onFrameChange = null;
    this.onLoop = null;
  }

  public static fromFrames(frames: string[]): AnimatedSprite3D {
    const textures = [];

    for (let i = 0; i < frames.length; ++i) {
      textures.push(Texture.from(frames[i]!));
    }

    return new AnimatedSprite3D(textures);
  }

  public static fromImages(images: string[]): AnimatedSprite3D {
    const textures = [];

    for (let i = 0; i < images.length; ++i) {
      textures.push(Texture.from(images[i]!));
    }

    return new AnimatedSprite3D(textures);
  }

  get totalFrames(): number {
    return this._textures!.length;
  }

  get textures(): AnimatedSpriteFrames {
    return this._textures!;
  }

  set textures(value: AnimatedSpriteFrames) {
    if (value[0] instanceof Texture) {
      this._textures = value as Texture[];
      this._durations = null;
    } else {
      this._textures = [];
      this._durations = [];

      for (let i = 0; i < value.length; i++) {
        this._textures.push((value[i] as FrameObject).texture);
        this._durations.push((value[i] as FrameObject).time);
      }
    }
    this._previousFrame = null;
    this.gotoAndStop(0);
    this._updateTexture();
  }

  get currentFrame(): number {
    let currentFrame = Math.floor(this._currentTime) % this._textures!.length;

    if (currentFrame < 0) {
      currentFrame += this._textures!.length;
    }

    return currentFrame;
  }

  set currentFrame(value: number) {
    if (value < 0 || value > this.totalFrames - 1) {
      throw new Error(
        `[AnimatedSprite]: Invalid frame index value ${value}, ` +
          `expected to be between 0 and totalFrames ${this.totalFrames}.`,
      );
    }

    const previousFrame = this.currentFrame;

    this._currentTime = value;

    if (previousFrame !== this.currentFrame) {
      this._updateTexture();
    }
  }

  get playing(): boolean {
    return this._playing;
  }

  get autoUpdate(): boolean {
    return this._autoUpdate;
  }

  set autoUpdate(value: boolean) {
    if (value !== this._autoUpdate) {
      this._autoUpdate = value;

      if (!this._autoUpdate && this._isConnectedToTicker) {
        Ticker.shared.remove(this.update, this);
        this._isConnectedToTicker = false;
      } else if (
        this._autoUpdate &&
        !this._isConnectedToTicker &&
        this._playing
      ) {
        Ticker.shared.add(this.update, this);
        this._isConnectedToTicker = true;
      }
    }
  }
}
