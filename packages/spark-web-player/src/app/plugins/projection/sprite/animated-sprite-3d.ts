/*
 * Based on pixijs AnimatedSprite
 * <https://github.com/pixijs/pixijs/blob/dev/src/scene/sprite-animated/AnimatedSprite.ts>
 *
 * Copyright (c) 2013-2023 Mathew Groves, Chad Engler
 * Released under the MIT license.
 */

import {
  AnimatedSpriteFrames,
  AnimatedSpriteOptions,
  FrameObject,
  Texture,
  Ticker,
  UPDATE_PRIORITY,
} from "pixi.js";
import { Camera } from "../camera/camera";
import { Sprite3D } from "./sprite-3d";

/**
 * An AnimatedSprite3D is a simple way to display an animation depicted by a list of textures in 3D space.
 *
 * ```js
 * import { AnimatedSprite3D, Texture } from 'pixi.js';
 *
 * const alienImages = [
 *     'image_sequence_01.png',
 *     'image_sequence_02.png',
 *     'image_sequence_03.png',
 *     'image_sequence_04.png',
 * ];
 * const textureArray = [];
 *
 * for (let i = 0; i < 4; i++)
 * {
 *     const texture = Texture.from(alienImages[i]);
 *     textureArray.push(texture);
 * }
 *
 * const animatedSprite = new AnimatedSprite3D(textureArray);
 * ```
 *
 * The more efficient and simpler way to create an animated sprite is using a {@link Spritesheet}
 * containing the animation definitions:
 * @example
 * import { AnimatedSprite3D, Assets } from 'pixi.js';
 *
 * const sheet = await Assets.load('assets/spritesheet.json');
 * animatedSprite = new AnimatedSprite3D(sheet.animations['image_sequence']);
 * @memberof scene
 */
export class AnimatedSprite3D extends Sprite3D {
  /**
   * The speed that the AnimatedSprite will play at. Higher is faster, lower is slower.
   * @default 1
   */
  public animationSpeed: number;

  /**
   * Whether or not the animate sprite repeats after playing.
   * @default true
   */
  public loop: boolean;

  /**
   * Update anchor to [Texture's defaultAnchor]{@link Texture#defaultAnchor} when frame changes.
   *
   * Useful with [sprite sheet animations]{@link Spritesheet#animations} created with tools.
   * Changing anchor for each frame allows to pin sprite origin to certain moving feature
   * of the frame (e.g. left foot).
   *
   * Note: Enabling this will override any previously set `anchor` on each frame change.
   * @default false
   */
  public updateAnchor: boolean;

  /**
   * User-assigned function to call when an AnimatedSprite finishes playing.
   * @example
   * animation.onComplete = () => {
   *     // Finished!
   * };
   */
  public onComplete?: (() => void) | null;

  /**
   * User-assigned function to call when an AnimatedSprite changes which texture is being rendered.
   * @example
   * animation.onFrameChange = () => {
   *     // Updated!
   * };
   */
  public onFrameChange?: ((currentFrame: number) => void) | null;

  /**
   * User-assigned function to call when `loop` is true, and an AnimatedSprite is played and
   * loops around to start again.
   * @example
   * animation.onLoop = () => {
   *     // Looped!
   * };
   */
  public onLoop?: (() => void) | null;

  private _playing: boolean;
  private _textures: Texture[] | null;
  private _durations: number[] | null;

  /**
   * `true` uses Ticker.shared to auto update animation time.
   * @default true
   */
  private _autoUpdate: boolean;

  /**
   * `true` if the instance is currently connected to Ticker.shared to auto update animation time.
   * @default false
   */
  private _isConnectedToTicker: boolean;

  /** Elapsed time since animation has been started, used internally to display current texture. */
  private _currentTime: number;

  /** The texture index that was displayed last time. */
  private _previousFrame: number | null;

  /**
   * @param frames - Collection of textures or frames to use.
   * @param autoUpdate - Whether to use Ticker.shared to auto update animation time.
   */
  constructor(frames: AnimatedSpriteFrames, camera?: Camera);
  /**
   * @param options - The options for the AnimatedSprite.
   */
  constructor(options: AnimatedSpriteOptions);
  /** @ignore */
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
      camera
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

  /** Stops the AnimatedSprite. */
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

  /** Plays the AnimatedSprite. */
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

  /**
   * Stops the AnimatedSprite and goes to a specific frame.
   * @param frameNumber - Frame index to stop at.
   */
  public gotoAndStop(frameNumber: number): void {
    this.stop();
    this.currentFrame = frameNumber;
  }

  /**
   * Goes to a specific frame and begins playing the AnimatedSprite.
   * @param frameNumber - Frame index to start at.
   */
  public gotoAndPlay(frameNumber: number): void {
    this.currentFrame = frameNumber;
    this.play();
  }

  /**
   * Advances the animation.
   * @param deltaTime - the amount of frames since last tick
   */
  public tick(deltaTime: number): void {
    // Calculate elapsed time based on ticker's deltaTime and animation speed.
    const elapsed = this.animationSpeed * deltaTime;
    const previousFrame = this.currentFrame;

    // If there are specific durations set for each frame:
    if (this._durations !== null) {
      // Calculate the lag for the current frame based on the current time.
      let lag = (this._currentTime % 1) * this._durations[this.currentFrame]!;

      // Adjust the lag based on elapsed time.
      lag += (elapsed / 60) * 1000;

      // If the lag is negative, adjust the current time and the lag.
      while (lag < 0) {
        this._currentTime--;
        lag += this._durations[this.currentFrame]!;
      }

      const sign = Math.sign(this.animationSpeed * deltaTime);

      // Floor the current time to get a whole number frame.
      this._currentTime = Math.floor(this._currentTime);

      // Adjust the current time and the lag until the lag is less than the current frame's duration.
      while (lag >= this._durations[this.currentFrame]!) {
        lag -= this._durations[this.currentFrame]! * sign;
        this._currentTime += sign;
      }

      // Adjust the current time based on the lag and current frame's duration.
      this._currentTime += lag / this._durations[this.currentFrame]!;
    } else {
      // If no specific durations set, simply adjust the current time by elapsed time.
      this._currentTime += elapsed;
    }

    // Handle scenarios when animation reaches the start or the end.
    if (this._currentTime < 0 && !this.loop) {
      // If the animation shouldn't loop and it reaches the start, go to the first frame.
      this.gotoAndStop(0);

      // If there's an onComplete callback, call it.
      if (this.onComplete) {
        this.onComplete();
      }
    } else if (this._currentTime >= this._textures!.length && !this.loop) {
      // If the animation shouldn't loop and it reaches the end, go to the last frame.
      this.gotoAndStop(this._textures!.length - 1);

      // If there's an onComplete callback, call it.
      if (this.onComplete) {
        this.onComplete();
      }
    } else if (previousFrame !== this.currentFrame) {
      // If the current frame is different from the last update, handle loop scenarios.
      if (this.loop && this.onLoop) {
        if (
          (this.animationSpeed > 0 && this.currentFrame < previousFrame) ||
          (this.animationSpeed < 0 && this.currentFrame > previousFrame)
        ) {
          // If the animation loops, and there's an onLoop callback, call it.
          this.onLoop();
        }
      }

      // Update the texture for the current frame.
      this._updateTexture();
    }
  }

  /**
   * Updates the object transform for rendering.
   * @param ticker - the ticker to use to update the object.
   */
  public update(ticker: Ticker): void {
    // If the animation isn't playing, no update is needed.
    if (!this._playing) {
      return;
    }
    this.update(ticker);
  }

  /** Updates the displayed texture to match the current frame index. */
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

  /** Stops the AnimatedSprite and destroys it. */
  public override destroy(): void {
    this.stop();
    super.destroy();

    this.onComplete = null;
    this.onFrameChange = null;
    this.onLoop = null;
  }

  /**
   * A short hand way of creating an AnimatedSprite from an array of frame ids.
   * @param frames - The array of frames ids the AnimatedSprite will use as its texture frames.
   * @returns - The new animated sprite with the specified frames.
   */
  public static fromFrames(frames: string[]): AnimatedSprite3D {
    const textures = [];

    for (let i = 0; i < frames.length; ++i) {
      textures.push(Texture.from(frames[i]!));
    }

    return new AnimatedSprite3D(textures);
  }

  /**
   * A short hand way of creating an AnimatedSprite from an array of image ids.
   * @param images - The array of image urls the AnimatedSprite will use as its texture frames.
   * @returns The new animate sprite with the specified images as frames.
   */
  public static fromImages(images: string[]): AnimatedSprite3D {
    const textures = [];

    for (let i = 0; i < images.length; ++i) {
      textures.push(Texture.from(images[i]!));
    }

    return new AnimatedSprite3D(textures);
  }

  /**
   * The total number of frames in the AnimatedSprite. This is the same as number of textures
   * assigned to the AnimatedSprite.
   * @readonly
   * @default 0
   */
  get totalFrames(): number {
    return this._textures!.length;
  }

  /** The array of textures used for this AnimatedSprite. */
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

  /** The AnimatedSprite's current frame index. */
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
          `expected to be between 0 and totalFrames ${this.totalFrames}.`
      );
    }

    const previousFrame = this.currentFrame;

    this._currentTime = value;

    if (previousFrame !== this.currentFrame) {
      this._updateTexture();
    }
  }

  /**
   * Indicates if the AnimatedSprite is currently playing.
   * @readonly
   */
  get playing(): boolean {
    return this._playing;
  }

  /** Whether to use Ticker.shared to auto update animation time. */
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
