import {
  DEG_TO_RAD,
  ObservablePoint,
  Texture,
  Ticker,
  UPDATE_PRIORITY,
} from "@pixi/core";
import type { IDestroyOptions } from "@pixi/display";
import { Sprite } from "@pixi/sprite";
import { Sprite3D as _Sprite3D } from "pixi3d/pixi7";
import { DEFAULT_PIXELS_PER_UNIT, Filter } from "../../core";
import { SpriteBillboardType } from "../types/SpriteBillboardType";
import { Camera } from "./Camera";
import { Plane } from "./Plane";
import { Point3D } from "./Point3D";

export interface Sprite3DOptions {
  fps?: number;
  ticker?: Ticker;
}

export class Sprite3D extends _Sprite3D {
  get sprite(): Sprite {
    return (this as unknown as { _sprite: Sprite })._sprite;
  }

  /**
   * The zIndex of the displayObject.
   *
   * If a container has the sortableChildren property set to true, children will be automatically
   * sorted by zIndex value; a higher value will mean it will be moved towards the end of the array,
   * and thus rendered on top of other display objects within the same container.
   * @see PIXI.Container#sortableChildren
   */
  override get zIndex(): number {
    return this.sprite.zIndex;
  }

  override set zIndex(value: number) {
    this.sprite.zIndex = value;
  }

  override get pivot(): ObservablePoint {
    return this.sprite.pivot;
  }

  override set pivot(value: ObservablePoint) {
    this.sprite.pivot = value;
  }

  // @ts-expect-error workaround because _filters is a property
  override get filters(): Filter[] {
    if (this.sprite) {
      return this.sprite.filters;
    }
    return null;
  }

  override set filters(value: Filter[]) {
    if (this.sprite) {
      this.sprite.filters = value;
    }
  }

  /**
   * The billboard type to use when rendering the sprite. Used for making the
   * sprite always face the viewer.
   */
  // @ts-expect-error workaround because _billboardType is private
  override get billboardType(): SpriteBillboardType | undefined {
    return (this as unknown as { _billboardType: SpriteBillboardType })
      ._billboardType;
  }

  // @ts-expect-error workaround because _billboardType is private
  override set billboardType(value: SpriteBillboardType | undefined) {
    (
      this as unknown as { _billboardType: SpriteBillboardType }
    )._billboardType = value;
  }

  /**
   * The speed that the animation will play at.
   * @default 1
   */
  public animationSpeed: number;

  /**
   * Whether or not the animation repeats after playing.
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
   * User-assigned function to call when an animation finishes playing.
   * @example
   * animation.onComplete = () => {
   *     // Finished!
   * };
   */
  public onComplete?: () => void;

  /**
   * User-assigned function to call when an AnimatedSVGSprite changes which texture is being rendered.
   * @example
   * animation.onFrameChange = () => {
   *   // updated!
   * };
   */
  public onFrameChange?: (currentFrame: number) => void;

  /**
   * User-assigned function to call when `loop` is true, and an AnimatedSVGSprite is played and
   * loops around to start again.
   * @example
   * animation.onLoop = () => {
   *   // looped!
   * };
   */
  public onLoop?: (currentFrame: number, currentIteration: number) => void;

  private _playing: boolean;

  private _textures: Texture[];

  /**
   * Ticker used to auto update the animation frame.
   * @default null
   */
  private _ticker: Ticker;

  /**
   * `true` if the instance is currently connected to Ticker to auto update animation time.
   * @default false
   */
  private _isConnectedToTicker: boolean;

  /** Elapsed time since animation has been started, used internally to display current texture. */
  protected _currentTime = 0;

  /**
   * The current frame that is displayed
   */
  protected _currentFrameIndex = 0;

  /**
   * Number of frames to display per second
   */
  protected _framesPerSecond = 60;

  /**
   * @param texture - textures that make up the animation.
   * @param {Ticker} [ticker=null] - Ticker used to auto update animation time.
   */
  constructor(texture?: Texture | Texture[], options?: Sprite3DOptions) {
    const textures = Array.isArray(texture)
      ? texture
      : [texture || Texture.EMPTY];
    const firstFrame = textures[0];
    super(firstFrame);
    this._textures = null;
    this._framesPerSecond =
      options?.fps || options?.ticker?.maxFPS || this._framesPerSecond;
    this._isConnectedToTicker = false;
    this.animationSpeed = 1;
    this.loop = true;
    this.updateAnchor = false;
    this.onComplete = null;
    this.onFrameChange = null;
    this.onLoop = null;
    this._currentTime = 0;
    this._playing = false;
    this._ticker = options?.ticker;
    this.textures = textures;
    this.pixelsPerUnit = DEFAULT_PIXELS_PER_UNIT;
  }

  /** Stops the animation. */
  public stop(): void {
    if (!this._playing) {
      return;
    }
    this._playing = false;
    if (this._ticker) {
      this._ticker.remove(this.update, this);
      this._isConnectedToTicker = false;
    }
  }

  /** Plays the animation. */
  public play(): void {
    if (this._playing) {
      return;
    }
    this._playing = true;
    if (this._ticker && !this._isConnectedToTicker) {
      this._ticker.add(this.update, this, UPDATE_PRIORITY.HIGH);
      this._isConnectedToTicker = true;
    }
  }

  /**
   * Goes to a specific frame.
   * @param frameNumber - Frame index to stop at.
   */
  public gotoFrame(frameNumber: number): void {
    const secondsPerFrame = 1 / this._framesPerSecond;
    this._currentTime = frameNumber * secondsPerFrame;
    this.updateFrame();
  }

  /**
   * Stops the animation and goes to a specific frame.
   * @param frameNumber - Frame index to stop at.
   */
  public gotoFrameAndStop(frameNumber: number): void {
    this.stop();
    this.gotoFrame(frameNumber);
  }

  /**
   * Goes to a specific frame and begins playing the animation.
   * @param frameNumber - Frame index to start at.
   */
  public gotoFrameAndPlay(frameNumber: number): void {
    this.gotoFrame(frameNumber);
    this.play();
  }

  /**
   * Updates the object for rendering.
   * @param deltaTime - Time in seconds since last tick.
   */
  update(deltaTime: number): void {
    if (!this._playing) {
      return;
    }
    this._currentTime += this.animationSpeed * deltaTime;
    this.updateFrame();
  }

  /** Updates the displayed texture to match the current frame index. */
  private updateFrame(): boolean {
    const secondsPerFrame = 1 / this._framesPerSecond;
    const duration = secondsPerFrame * this._textures.length;
    const normalizedTime = this._currentTime % duration;
    const currentIteration = Math.floor(this._currentTime / duration);
    const currentFrameIndex = Math.floor(normalizedTime / secondsPerFrame);
    if (currentFrameIndex !== this._currentFrameIndex) {
      if (currentFrameIndex < this._currentFrameIndex) {
        this.onLoop?.(currentFrameIndex, currentIteration);
      }
      this.onFrameChange?.(currentFrameIndex);
      this._currentFrameIndex = currentFrameIndex;
      this.texture = this._textures[this._currentFrameIndex];
      return true;
    }
    return false;
  }

  /**
   * Stops the animation and destroys it.
   * @param {object|boolean} [options] - Options parameter. A boolean will act as if all options
   *  have been set to that value.
   * @param {boolean} [options.children=false] - If set to true, all the children will have their destroy
   *      method called as well. 'options' will be passed on to those calls.
   * @param {boolean} [options.texture=false] - Should it destroy the current texture of the sprite as well.
   * @param {boolean} [options.baseTexture=false] - Should it destroy the base texture of the sprite as well.
   */
  public override destroy(options?: IDestroyOptions | boolean): void {
    this.stop();
    super.destroy(options);
    this.onComplete = null;
    this.onFrameChange = null;
    this.onLoop = null;
  }

  isOffCamera(camera: Camera): boolean {
    return (
      this.position.z > camera.position.z + camera.near ||
      this.position.z < camera.position.z - camera.far
    );
  }

  planeFromPositionAndNormal(position: Point3D, normal: Point3D): Plane {
    return new Plane(normal, Point3D.dot(position, normal.normalize()));
  }

  isInCameraFrustum(camera: Camera): boolean {
    const center = this.position;
    const bounds = this.getBounds();
    const radius = Math.max(bounds.width, bounds.height);
    const aspect = camera.renderer.width / camera.renderer.height;
    const halfVSide =
      camera.far * Math.tan(camera.fieldOfView * 0.5 * DEG_TO_RAD);
    const halfHSide = halfVSide * aspect;

    const near = this.planeFromPositionAndNormal(
      Point3D.add(
        camera.worldTransform.position,
        Point3D.scale(camera.worldTransform.forward, camera.near)
      ),
      camera.worldTransform.forward
    );
    if (Point3D.dot(center, near.normal) - near.distance < 0) {
      return false;
    }

    const far = this.planeFromPositionAndNormal(
      Point3D.add(
        camera.worldTransform.position,
        Point3D.scale(camera.worldTransform.forward, camera.far)
      ),
      camera.worldTransform.backward
    );
    if (Point3D.dot(center, far.normal) - far.distance < 0) {
      return false;
    }

    const right = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        Point3D.subtract(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.right, halfHSide)
        ),
        camera.worldTransform.up
      )
    );
    if (Point3D.dot(center, right.normal) - right.distance < -radius) {
      return false;
    }

    const left = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        camera.worldTransform.up,
        Point3D.add(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.right, halfHSide)
        )
      )
    );
    if (Point3D.dot(center, left.normal) - left.distance < -radius) {
      return false;
    }

    const bottom = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        camera.worldTransform.right,
        Point3D.subtract(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.up, halfVSide)
        )
      )
    );
    if (Point3D.dot(center, bottom.normal) - bottom.distance < -radius) {
      return false;
    }

    const top = this.planeFromPositionAndNormal(
      camera.worldTransform.position,
      Point3D.cross(
        Point3D.add(
          Point3D.scale(camera.worldTransform.forward, camera.far),
          Point3D.scale(camera.worldTransform.up, halfVSide)
        ),
        camera.worldTransform.right
      )
    );
    if (Point3D.dot(center, top.normal) - top.distance < -radius) {
      return false;
    }

    return true;
  }

  /**
   * A short hand way of creating an animation from an array of frame ids.
   * @param frames - The array of frames ids the animation will use as its texture frames.
   * @returns - The new animated sprite with the specified frames.
   */
  public static fromFrames(frames: string[]): Sprite3D {
    const textures = [];
    for (let i = 0; i < frames.length; i += 1) {
      textures.push(Texture.from(frames[i]));
    }
    return new Sprite3D(textures);
  }

  /**
   * A short hand way of creating an animation from an array of image ids.
   * @param images - The array of image urls the animation will use as its texture frames.
   * @returns The new animate sprite with the specified images as frames.
   */
  public static fromImages(images: string[]): Sprite3D {
    const textures = [];
    for (let i = 0; i < images.length; i += 1) {
      textures.push(Texture.from(images[i]));
    }
    return new Sprite3D(textures);
  }

  /**
   * The total number of frames in the animation. This is the same as number of textures
   * assigned to the animation.
   * @readonly
   * @default 0
   */
  get totalFrames(): number {
    return this._textures.length;
  }

  /** The array of textures used for this animation. */
  get textures(): Texture[] {
    return this._textures;
  }

  set textures(value: Texture[]) {
    this._textures = value;
    this.gotoFrame(0);
  }

  /** The animation's current frame index. */
  get currentFrame(): number {
    return this._currentFrameIndex;
  }

  set currentFrame(value: number) {
    if (this.totalFrames > 0) {
      if (value < 0 || value >= this.totalFrames) {
        throw new Error(
          `[animation]: Invalid frame index value ${value}, ` +
            `expected to be between 0 and totalFrames ${this.totalFrames}.`
        );
      }
    }
    this.gotoFrame(value);
  }

  /**
   * Indicates if the animation is currently playing.
   * @readonly
   */
  get playing(): boolean {
    return this._playing;
  }

  /** Ticker used to auto update animation time. */
  get ticker(): Ticker {
    return this._ticker;
  }

  set ticker(value: Ticker) {
    if (value !== this._ticker) {
      if (this._ticker && !value && this._isConnectedToTicker) {
        this._ticker.remove(this.update, this);
        this._isConnectedToTicker = false;
      } else if (value && !this._isConnectedToTicker && this._playing) {
        value.add(this.update, this);
        this._isConnectedToTicker = true;
      }
      this._ticker = value;
    }
  }
}
