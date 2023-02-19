import {
  Beat,
  EASE,
  Graphic,
  interpolate,
  Midi,
  parseMidi,
  ReadOnly,
  SparkContext,
} from "../../../../../spark-engine";
import { generateSpritesheet } from "../../plugins/animation";
import { Application } from "../../plugins/app";
import { IRenderer, Texture, Ticker } from "../../plugins/core";
import { generateGrid } from "../../plugins/graphics";
import { Container3D, Quaternion, Sprite3D } from "../../plugins/projection";
import { SparkScene } from "../SparkScene";

const createAnimatedSprite = (
  animation: Texture[],
  ticker: Ticker
): Sprite3D => {
  const sprite = new Sprite3D(animation, { fps: ticker?.maxFPS });
  sprite.play();
  return sprite;
};

const getXOffset = (columnCount: number): number => {
  return -columnCount / 2 + 0.5;
};

const getYOffset = (): number => {
  return 1;
};

const getZFactor = (zSpacing: number): number => {
  return -zSpacing;
};

const getProgress = (value: number): number => {
  return value - Math.floor(value);
};

const getAnimation = (
  type: string,
  textures: Record<string, Texture[]>
): Texture[] => {
  if (type === "P") {
    return textures["_m1a_bunny"];
  }
  if (type === "X") {
    return textures["_m1a_flyerguy"];
  }
  if (type === "\\") {
    return textures["_m_swipe"];
  }
  if (type === "/") {
    return textures["_m_swipe"];
  }
  if (type === "<") {
    return textures["_m_swipe"];
  }
  if (type === ">") {
    return textures["_m_swipe"];
  }
  return textures["_m_tap"];
};

const isTargetFlippedX = (beat: Beat): boolean => {
  switch (beat.s) {
    case ">":
      return true;
    case "/":
      return true;
    default:
      return false;
  }
};

const getTargetColor = (beat: Beat): number => {
  if (beat.s === "*") {
    return 0x006cff;
  }
  return 0xf21212;
};

const createOverlayPaneSprite = (columnCount: number): Sprite3D => {
  const sprite = new Sprite3D();
  sprite.position.x = getXOffset(columnCount);
  sprite.position.y = getYOffset();
  sprite.alpha = 0;
  return sprite;
};

const createOverlayCellSprites = (
  textures: Record<string, Texture[]>,
  ticker: Ticker,
  columnCount: number,
  rowCount: number,
  scale: number
): Sprite3D[][] => {
  const color = 0xffffff;
  const sprites = [];
  const animation = getAnimation("*", textures);
  for (let x = 0; x < columnCount; x += 1) {
    for (let y = 0; y < rowCount; y += 1) {
      const sprite = createAnimatedSprite(animation, ticker);
      sprite.tint = color;
      sprite.alpha = 0;
      sprite.position.x = x;
      sprite.position.y = y;
      sprite.scale.x = scale;
      sprite.scale.y = scale;
      if (!sprites[x]) {
        sprites[x] = [];
      }
      sprites[x][y] = sprite;
    }
  }
  return sprites;
};

const createTargetContainer = (
  textures: Record<string, Texture[]>,
  beat: Beat,
  tileColumnCount: number,
  tileZSpacing: number,
  scale: number,
  xAngle: number
): Container3D => {
  const x = beat.x + getXOffset(tileColumnCount);
  const y = beat.y;
  const z = beat.z * getZFactor(tileZSpacing);
  const animation = getAnimation(beat.s, textures);
  const firstFrame = animation?.[0];
  const flippedX = isTargetFlippedX(beat);
  const color = getTargetColor(beat);
  const sprite = new Sprite3D(firstFrame);
  sprite.rotationQuaternion.setEulerAngles(xAngle, 0, 0);
  sprite.position.y = getYOffset();
  sprite.tint = color;
  sprite.scale.x = flippedX ? -scale : scale;
  sprite.scale.y = scale;
  const container = new Container3D();
  container.position.x = x;
  container.position.y = y;
  container.position.z = z;
  container.addChild(sprite);
  return container;
};

const createObstacleSprite = (
  textures: Record<string, Texture[]>,
  ticker: Ticker,
  beat: Beat,
  tileColumnCount: number,
  tileZSpacing: number,
  scale: number
): Sprite3D => {
  const x = beat.x + getXOffset(tileColumnCount);
  const y = beat.y;
  const z = beat.z * getZFactor(tileZSpacing);
  const animation = getAnimation(beat.s, textures);
  const sprite = createAnimatedSprite(animation, ticker);
  sprite.anchor.set(0.5, 1.0);
  sprite.position.x = x;
  sprite.position.y = y;
  sprite.position.z = z - x * 0.001;
  sprite.scale.x = scale;
  sprite.scale.y = scale;
  return sprite;
};

const getAnimationTextures = async (
  renderer: IRenderer,
  svg: SVGSVGElement,
  fps = 60,
  id = "",
  options: {
    quality?: number;
    fillColor?: string | number;
    strokeColor?: string | number;
    strokeWidth?: number;
  } = {}
): Promise<Texture[]> => {
  const animationName = "default";
  const sheet = generateSpritesheet(
    renderer,
    svg,
    fps,
    id,
    animationName,
    options
  );
  await sheet.parse();
  const textures = sheet.animations[animationName];
  return textures;
};

export class MainScene extends SparkScene {
  private _tileColumnCount = 3;

  private _tileRowCount = 1;

  private _tileZSpacing = 8;

  private _tileSize = 32;

  private _targetScale = 1;

  private _targetXAngle = 0;

  private _obstacleSpriteZOffset = 0.1;

  private _playerSpriteXOffset = -0.0625;

  private _playerSpriteZOffset = 1.75;

  private _playerScale = 2;

  private _obstacleScale = 2;

  private _gridThickness = 1;

  private _gridColor = 0x0000ff;

  private _beatPassedColor = 0x404040;

  private _animationSpeed = 0.5;

  private _spawnDistance = 5;

  private _spawnTransitionEase = EASE.backOut;

  private _spawnTransitionSpeed = 0.2;

  private _spawnYOffset = -1;

  private _cameraTransitionEase = EASE.expoInOut;

  private _cameraTransitionDelay = 0.5;

  private _cameraTransitionDuration = 2;

  private _overlayTransitionEase = EASE.expoInOut;

  private _overlayTransitionDelay = this._cameraTransitionDelay + 0.5;

  private _overlayTransitionDuration = 2;

  private _startHeight = 3;

  private _startDistance = 6;

  private _startAngle = 30;

  private _followHeight = 2;

  private _followDistance = 4;

  private _followAngle = 5;

  private _obstacleBeats: Beat[] = [];

  private _targetBeats: Beat[] = [];

  private _fillAnimations: Record<string, Texture[]> = {};

  private _strokeAnimations: Record<string, Texture[]> = {};

  private _floorSprites: Sprite3D[] = [];

  private _targetSprites: Sprite3D[] = [];

  private _obstacleSprites: Sprite3D[] = [];

  private _overlayPaneSprite: Sprite3D;

  private _overlayCellSprites: Sprite3D[][] = [];

  private _playerContainer: Container3D;

  private _playerSprite: Sprite3D;

  private _upNext: { beat: Beat; sprite: Sprite3D }[][] = [];

  private _floorRotation = new Quaternion().setEulerAngles(-90, 0, 0).array;

  private _nextArrowZ = 0;

  private _beatsPerSecond = 120;

  private _currentBeat = 0;

  private _beatPosition = 0;

  private _running = true;

  constructor(context: SparkContext, app: Application) {
    super(context, app);
    // Tiles
    const beatmaps = Object.values(
      this.context.game.struct.config.objectMap?.["beatmap"] || {}
    );
    const beatmap = beatmaps[0];
    const beats = (beatmap?.beats as unknown as Beat[]) || [];
    beats.forEach((beat) => {
      if (beat.s === "X") {
        this._obstacleBeats.push(beat);
      } else {
        this._targetBeats.push(beat);
      }
    });
    const bpm = beats[0]?.bpm ?? 120;
    this._beatsPerSecond = bpm / 60;
    const maxZ = beats[beats.length - 1]?.z ?? 0;
    // Grid
    const gridTexture = generateGrid(
      this.renderer,
      this._gridThickness,
      this._tileSize,
      this._tileColumnCount,
      this._tileZSpacing
    );
    const gridHeight = this._tileZSpacing;
    const farthestZ = maxZ * getZFactor(this._tileZSpacing);
    const numTracks = Math.ceil(Math.abs(farthestZ / gridHeight));
    for (let i = 0; i < numTracks; i += 1) {
      const z = i * -gridHeight;
      const grid = new Sprite3D(gridTexture);
      grid.width = this._tileColumnCount;
      grid.height = this._tileZSpacing;
      grid.zIndex = -1000;
      grid.rotationQuaternion.array = this._floorRotation;
      grid.anchor.set(0.5, 1.0); // Center Bottom
      grid.position.x = 0;
      grid.position.y = 0;
      grid.position.z = z;
      grid.tint = this._gridColor;
      this._floorSprites.push(grid);
    }
    // Camera
    this.dolly.target.x = 0;
    this.dolly.target.y = this._startHeight;
    this.dolly.target.z = this._beatPosition;
    this.dolly.angles.x = this._startAngle;
    this.dolly.distance = this._startDistance;
    this.dolly.updateCamera();
  }

  override async load(): Promise<void> {
    const graphicMap: Record<string, ReadOnly<Graphic>> = this.context?.game
      ?.struct?.config?.objectMap?.graphic || {};
    const midiMap: Record<string, ReadOnly<Midi>> = this.context.game.struct
      .config.objectMap?.midi || {};
    await Promise.all([
      ...Object.entries(graphicMap).map(async ([name, asset]) => {
        const src = asset.src as unknown as string;
        const data = await this.assets.load<SVGSVGElement>(`${src}&type=svg`);
        if (data) {
          this._strokeAnimations[name] = await getAnimationTextures(
            this.renderer,
            data,
            this.maxFPS,
            `overlay-${name}`,
            {
              fillColor: "none",
              strokeColor: "#fff",
              strokeWidth: 1,
            }
          );
          this._fillAnimations[name] = await getAnimationTextures(
            this.renderer,
            data,
            this.maxFPS,
            name
          );
        }
      }),
      ...Object.entries(midiMap).map(async ([name, asset]) => {
        const src = asset.src as unknown as string;
        const data = await this.assets.load<ArrayBuffer>(`${src}&type=mid`);
        if (data) {
          const midi = parseMidi(data);
        }
      }),
    ]);
  }

  override init(): void {
    this._floorSprites.forEach((sprite) => {
      this.stage.addChild(sprite);
    });
    const playerAnimation = getAnimation("P", this._fillAnimations);
    if (playerAnimation) {
      this._playerContainer = new Container3D();
      this._playerContainer.pivot.set(0.5, 1.0); // Center Bottom
      this._playerSprite = createAnimatedSprite(playerAnimation, this.ticker);
      this._playerSprite.anchor.set(0.5, 1.0); // Center Bottom
      this._playerSprite.scale.x = this._playerScale;
      this._playerSprite.scale.y = this._playerScale;
      this._playerSprite.position.x = this._playerSpriteXOffset;
      this._playerSprite.position.z = this._playerSpriteZOffset;
      this._playerSprite.billboardType = "spherical";
      this._overlayPaneSprite = createOverlayPaneSprite(this._tileColumnCount);
      this._overlayCellSprites = createOverlayCellSprites(
        this._strokeAnimations,
        this.ticker,
        this._tileColumnCount,
        this._tileRowCount,
        this._targetScale
      );
      this._overlayCellSprites.forEach((rows, x) => {
        rows.forEach((_, y) => {
          this._overlayPaneSprite.addChild(this._overlayCellSprites[x][y]);
        });
      });
      this._playerContainer.addChild(this._playerSprite);
      this._playerContainer.addChild(this._overlayPaneSprite);
      this.stage.addChild(this._playerContainer);
    }
    this._targetBeats.forEach((beat) => {
      const targetContainer = createTargetContainer(
        this._fillAnimations,
        beat,
        this._tileColumnCount,
        this._tileZSpacing,
        this._targetScale,
        this._targetXAngle
      );
      this._targetSprites.push(targetContainer.children[0] as Sprite3D);
      this.stage.addChild(targetContainer);
    });
    this._obstacleBeats.forEach((beat) => {
      const obstacleSprite = createObstacleSprite(
        this._fillAnimations,
        this.ticker,
        beat,
        this._tileColumnCount,
        this._tileZSpacing,
        this._obstacleScale
      );
      obstacleSprite.z += this._obstacleSpriteZOffset;
      this._obstacleSprites.push(obstacleSprite);
      this.stage.addChild(obstacleSprite);
    });
  }

  override start(): void {
    this.context.game.tween.add("camera", {
      delay: this._cameraTransitionDelay,
      duration: this._cameraTransitionDuration,
      callback: (progress: number) => {
        if (this.dolly) {
          this.dolly.target.y = interpolate(
            progress,
            this._startHeight,
            this._followHeight,
            this._cameraTransitionEase
          );
          this.dolly.angles.x = interpolate(
            progress,
            this._startAngle,
            this._followAngle,
            this._cameraTransitionEase
          );
          this.dolly.distance = interpolate(
            progress,
            this._startDistance,
            this._followDistance,
            this._cameraTransitionEase
          );
        }
        if (this._playerSprite) {
          this._playerSprite.alpha = interpolate(
            progress,
            1,
            0,
            this._cameraTransitionEase
          );
        }
      },
    });

    this.context.game.tween.add("overlay", {
      delay: this._overlayTransitionDelay,
      duration: this._overlayTransitionDuration,
      callback: (progress: number) => {
        if (this._overlayPaneSprite) {
          this._overlayPaneSprite.alpha = interpolate(
            progress,
            0,
            1,
            this._overlayTransitionEase
          );
        }
      },
    });
  }

  override update(_time: number, delta: number): void {
    const beatDelta = this._beatsPerSecond * delta;
    if (this._running) {
      this._currentBeat += beatDelta;
      this._beatPosition = -this._currentBeat * this._tileZSpacing;
      const beatProgress = getProgress(this._currentBeat);
      const animationProgress = getProgress(
        this._currentBeat * this._animationSpeed
      );

      this.dolly.target.x = 0;
      this.dolly.target.y = this._followHeight;
      this.dolly.target.z = this._beatPosition;
      this.dolly.updateCamera();
      if (this._playerContainer) {
        this._playerContainer.position.z = this._beatPosition;
      }
      if (this._playerSprite) {
        this._playerSprite.goto(animationProgress);
      }

      for (let x = 0; x < this._upNext.length; x += 1) {
        const row = this._upNext[x];
        if (row) {
          for (let y = 0; y < row.length; y += 1) {
            this._upNext[x][y] = undefined;
          }
        }
      }
      this._nextArrowZ = 0;
      this._targetSprites.forEach((sprite, i) => {
        if (sprite) {
          sprite.goto(beatProgress);
          const beat = this._targetBeats[i];
          const container = sprite.parent as Container3D;
          const beatZ = container.position.z;
          if (this._beatPosition < beatZ) {
            // Beat is behind player
            sprite.tint = this._beatPassedColor;
          } else {
            // Beat is in front of player
            if (!this._nextArrowZ && beatZ < this._nextArrowZ) {
              this._nextArrowZ = beatZ;
            }
            if (beatZ === this._nextArrowZ) {
              if (!this._upNext[beat.x]) {
                this._upNext[beat.x] = [];
              }
              if (!this._upNext[beat.x][beat.y]) {
                this._upNext[beat.x][beat.y] = { sprite, beat };
              }
            }
            // Only show beats that are close to player
            if (
              this._beatPosition - this._spawnDistance * this._tileZSpacing <
              beatZ
            ) {
              const key = `beat-${i}`;
              if (!this.context.game.tween.get(key)) {
                const startY = container.position.y + this._spawnYOffset;
                const endY = container.position.y;
                container.position.y = startY;
                const unitsPerSecond =
                  this._beatsPerSecond * this._tileZSpacing;
                const secondsPerUnit = 1 / unitsPerSecond;
                const duration = secondsPerUnit / this._spawnTransitionSpeed;
                this.context.game.tween.add(key, {
                  duration,
                  callback: (progress: number) => {
                    if (container) {
                      container.alpha = interpolate(
                        progress,
                        0,
                        1,
                        this._spawnTransitionEase
                      );
                      container.position.y = interpolate(
                        progress,
                        startY,
                        endY,
                        this._spawnTransitionEase
                      );
                    }
                  },
                });
              }
            } else {
              container.alpha = 0;
            }
          }
        }
      });
      for (let x = 0; x < this._overlayCellSprites.length; x += 1) {
        const row = this._overlayCellSprites[x];
        if (row) {
          for (let y = 0; y < row.length; y += 1) {
            const overlaySprite = this._overlayCellSprites[x][y];
            if (overlaySprite) {
              const next = this._upNext?.[x]?.[y];
              if (next?.sprite) {
                const { sprite, beat } = next;
                const newTextures = getAnimation(
                  beat.s,
                  this._strokeAnimations
                );
                if (overlaySprite.textures !== newTextures) {
                  overlaySprite.textures = newTextures;
                }
                overlaySprite.scale.x = sprite.scale.x;
                overlaySprite.scale.y = sprite.scale.y;
                overlaySprite.tint = 0xffffff;
                overlaySprite.alpha = 1;
              } else {
                overlaySprite.alpha = 0;
              }
              overlaySprite.goto(beatProgress);
            }
          }
        }
      }
    }
  }

  override onTap(_event: PointerEvent): void {
    this._running = !this._running;
  }
}
