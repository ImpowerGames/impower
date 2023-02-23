import {
  Beat,
  EASE,
  Graphic,
  Midi,
  parseMidi,
  ReadOnly,
  SparkContext,
} from "../../../../../spark-engine";
import { generateSpritesheet } from "../../plugins/animation";
import { Application } from "../../plugins/app";
import { IRenderer, Texture } from "../../plugins/core";
import { DisplayObject } from "../../plugins/display";
import { generateGrid } from "../../plugins/graphics";
import { Container3D, Quaternion, Sprite3D } from "../../plugins/projection";
import { Ticker } from "../../plugins/ticker";
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

const getAnimationProgress = (
  beat: number,
  speed: number,
  offset: number
): number => {
  const value = beat * speed;
  const progress = value - Math.floor(value);
  const offsetProgress = progress + offset;
  return offsetProgress < 0 ? 1 + offsetProgress : offsetProgress;
};

const getOutlineName = (name: string): string => {
  return `outline-${name}`;
};

const getAnimationName = (type: string): string => {
  if (type === "P") {
    return `_m1a_bunny`;
  }
  if (type === "X") {
    return `_m1a_flyerguy`;
  }
  if (type === "*") {
    return `_m_circle`;
  }
  if (type === "\\") {
    return `_m_arrow`;
  }
  if (type === "/") {
    return `_m_arrow`;
  }
  if (type === "<") {
    return `_m_arrow`;
  }
  if (type === ">") {
    return `_m_arrow`;
  }
  if (type === "^") {
    return `_m_arrow`;
  }
  if (type === "v") {
    return `_m_arrow`;
  }
  return "";
};

const isTextureFlippedX = (beat: Beat): boolean => {
  switch (beat.s) {
    case ">":
      return true;
    case "/":
      return true;
    default:
      return false;
  }
};

const isTextureFlippedY = (beat: Beat): boolean => {
  switch (beat.s) {
    case "v":
      return true;
    default:
      return false;
  }
};

const getSpriteInactiveColor = (_beat: Beat): number => {
  return 0x404040;
};

const getSpriteActiveColor = (beat: Beat): number => {
  if (beat.s === "*") {
    return 0x0037ff;
  }
  return 0xff3700;
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
  const animationName = getAnimationName("*");
  const animation = textures[animationName];
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

const createTargetSpriteContainer = (
  textures: Record<string, Texture[]>,
  beat: Beat,
  tileColumnCount: number,
  tileZSpacing: number,
  scale: number,
  xAngle: number,
  animationSpeed: number,
  animationOffset: number
): Container3D => {
  const x = beat.x + getXOffset(tileColumnCount);
  const y = beat.y;
  const z = beat.z * getZFactor(tileZSpacing);
  const animationName = getAnimationName(beat.s);
  const animation = textures[animationName];
  const flippedX = isTextureFlippedX(beat);
  const flippedY = isTextureFlippedY(beat);
  const sprite = new Sprite3D(animation);
  sprite.rotationQuaternion.setEulerAngles(xAngle, 0, 0);
  sprite.position.y = getYOffset();
  sprite.scale.x = flippedX ? -scale : scale;
  sprite.scale.y = flippedY ? -scale : scale;
  const animationProgress = getAnimationProgress(
    beat.z,
    animationSpeed,
    animationOffset
  );
  sprite.goto(animationProgress);
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
  const animationName = getAnimationName(beat.s);
  const animation = textures[animationName];
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

  private _tilePixelSize = 32;

  private _tapTargetXAngle = 0;

  private _obstacleSpriteZOffset = 0.1;

  private _playerSpriteXOffset = -0.0625;

  private _playerSpriteZOffset = 1.75;

  private _playerScale = 2;

  private _obstacleScale = 2;

  private _targetScale = 1;

  private _gridThickness = 1;

  private _gridColor = 0x0000ff;

  private _animationSpeed = 0.5;

  private _spawnDistance = 4;

  private _spawnTransitionEase = EASE.backOut;

  private _spawnTransitionSpeed = 0.25;

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

  private _despawnDistance = 4;

  private _animationOffset = 0;

  private _obstacleBeats: Beat[] = [];

  private _targetBeats: Beat[] = [];

  private _animations: Record<string, Texture[]> = {};

  private _floorSprites: Sprite3D[] = [];

  private _targetContainers: Container3D[] = [];

  private _obstacleSprites: Sprite3D[] = [];

  private _overlayPaneSprite: Sprite3D;

  private _overlayCellSprites: Sprite3D[][] = [];

  private _playerContainer: Container3D;

  private _playerSprite: Sprite3D;

  private _floorRotation = new Quaternion().setEulerAngles(-90, 0, 0).array;

  private _upNext: { beat: Beat; child: DisplayObject }[][] = [];

  private _beatsPerMS = 120 * 1000;

  private _currentBeat = 0;

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
    const bps = bpm / 60;
    this._beatsPerMS = bps / 1000;
    const maxZ = beats[beats.length - 1]?.z ?? 0;
    // Grid
    const gridTexture = generateGrid(
      this.renderer,
      this._gridThickness,
      this._tilePixelSize,
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
    this.dolly.target.z = 0;
    this.dolly.angle.x = this._startAngle;
    this.dolly.distance = this._startDistance;
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
          const key = name;
          this._animations[key] = await getAnimationTextures(
            this.renderer,
            data,
            this.ticker?.maxFPS,
            key
          );
          const outlineKey = getOutlineName(name);
          this._animations[outlineKey] = await getAnimationTextures(
            this.renderer,
            data,
            this.ticker?.maxFPS,
            outlineKey,
            {
              strokeWidth: 1,
              strokeColor: 0xffffff,
              fillColor: "none",
            }
          );
        }
      }),
      ...Object.entries(midiMap).map(async ([, asset]) => {
        const src = asset.src as unknown as string;
        const data = await this.assets.load<ArrayBuffer>(`${src}&type=mid`);
        if (data) {
          const midi = parseMidi(data);
          console.warn(midi);
        }
      }),
    ]);
  }

  override init(): void {
    this._floorSprites.forEach((sprite) => {
      this.stage.addChild(sprite);
    });
    const animationName = getAnimationName("P");
    const playerAnimation = this._animations[animationName];
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
        this._animations,
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
      const targetContainer = createTargetSpriteContainer(
        this._animations,
        beat,
        this._tileColumnCount,
        this._tileZSpacing,
        this._targetScale,
        this._tapTargetXAngle,
        this._animationSpeed,
        this._animationOffset
      );
      this._targetContainers.push(targetContainer);
      this.stage.addChild(targetContainer);
    });
    this._obstacleBeats.forEach((beat) => {
      const obstacleSprite = createObstacleSprite(
        this._animations,
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
    this.context.game.tween.add("move-camera", {
      delay: this._cameraTransitionDelay,
      duration: this._cameraTransitionDuration,
      ease: this._cameraTransitionEase,
      on: (tween) => {
        if (this.dolly) {
          this.dolly.target.y = tween(this._startHeight, this._followHeight);
          this.dolly.angle.x = tween(this._startAngle, this._followAngle);
          this.dolly.distance = tween(
            this._startDistance,
            this._followDistance
          );
        }
        if (this._playerSprite) {
          this._playerSprite.alpha = tween(1, 0);
        }
      },
    });

    this.context.game.tween.add("show-overlay", {
      delay: this._overlayTransitionDelay,
      duration: this._overlayTransitionDuration,
      ease: this._overlayTransitionEase,
      on: (tween) => {
        if (this._overlayPaneSprite) {
          this._overlayPaneSprite.alpha = tween(0, 1);
        }
      },
    });

    // Target spawn animation duration
    const msPerBeat = 1 / this._beatsPerMS;
    const msPerUnit = msPerBeat / this._tileZSpacing;
    const spawnDurationMS = msPerUnit / this._spawnTransitionSpeed;
    const spawnDuration = spawnDurationMS / 1000;

    this._targetContainers.forEach((container, i) => {
      if (container) {
        const beat = this._targetBeats[i];
        const distance = (beat.z - this._spawnDistance) * this._tileZSpacing;
        const spawnDelayMS = distance * msPerUnit;
        const spawnDelay = spawnDelayMS / 1000;
        // Only show sprites spawning in when they are close to the player
        const key = `spawn-beat-${i}`;
        if (!this.context.game.tween.get(key)) {
          const startY = container.position.y + this._spawnYOffset;
          const endY = container.position.y;
          container.position.y = startY;
          this.context.game.tween.add(key, {
            delay: spawnDelay,
            duration: spawnDuration,
            ease: this._spawnTransitionEase,
            on: (tween, p) => {
              container.renderable = p >= 0;
              if (container) {
                container.alpha = tween(0, 1);
                container.position.y = tween(startY, endY);
              }
            },
          });
        }
      }
    });
  }

  override update(deltaMS: number): boolean {
    // Move beat forward
    this._currentBeat += this._beatsPerMS * deltaMS;

    // Calculate progress
    const beatZ = -this._currentBeat * this._tileZSpacing;
    const animationProgress = getAnimationProgress(
      this._currentBeat,
      this._animationSpeed,
      this._animationOffset
    );

    // Player follow Beat
    if (this._playerContainer) {
      this._playerContainer.position.z = beatZ;
    }

    // Animate Player
    if (this._playerSprite) {
      this._playerSprite.goto(animationProgress);
    }

    // Animate Obstacles
    this._obstacleSprites.forEach((sprite) => {
      if (sprite) {
        const spriteZ = sprite.position.z;
        // Sprite is behind player
        if (spriteZ > beatZ + this._despawnDistance) {
          // Sprite is now off camera
          sprite.renderable = false;
        } else {
          // Sprite is still on camera
          sprite.renderable = true;
          sprite.goto(animationProgress);
        }
      }
    });

    // Animate Targets and Indicator
    for (let x = 0; x < this._upNext.length; x += 1) {
      const row = this._upNext[x];
      if (row) {
        for (let y = 0; y < row.length; y += 1) {
          this._upNext[x][y] = undefined;
        }
      }
    }
    let nextTapTargetZ = 0;
    this._targetContainers.forEach((container, i) => {
      if (container) {
        const child = container.children[0];
        const beat = this._targetBeats[i];
        const spriteZ = container.position.z;
        if (spriteZ > beatZ) {
          // Sprite is behind player
          if (spriteZ > beatZ + this._despawnDistance) {
            // Sprite is now off camera
            child.renderable = false;
          } else {
            // Sprite is still on camera
            child.renderable = true;
          }
          if (child instanceof Sprite3D) {
            child.tint = getSpriteInactiveColor(beat);
            child.goto(animationProgress);
          }
        } else {
          // Sprite is in front of player
          child.renderable = true;
          if (child instanceof Sprite3D) {
            child.tint = getSpriteActiveColor(beat);
            child.goto(
              getAnimationProgress(
                beat.z,
                this._animationSpeed,
                this._animationOffset
              )
            );
          }
          if (!nextTapTargetZ && spriteZ < nextTapTargetZ) {
            nextTapTargetZ = spriteZ;
          }
          if (spriteZ === nextTapTargetZ) {
            if (!this._upNext[beat.x]) {
              this._upNext[beat.x] = [];
            }
            if (!this._upNext[beat.x][beat.y]) {
              this._upNext[beat.x][beat.y] = { child, beat };
            }
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
            const child = next?.child;
            const beat = next?.beat;
            if (child) {
              overlaySprite.alpha = 1;
              const animationName = getAnimationName(beat.s);
              const animation = this._animations[getOutlineName(animationName)];
              overlaySprite.textures = animation;
              overlaySprite.scale.x = child.scale.x;
              overlaySprite.scale.y = child.scale.y;
            } else {
              overlaySprite.alpha = 0;
            }
            overlaySprite.goto(animationProgress);
          }
        }
      }
    }

    if (this.context.game.tween.state.elapsedMS > this._cameraTransitionDelay) {
      // Camera follow Beat
      this.dolly.target.x = 0;
      this.dolly.target.y = this._followHeight;
      this.dolly.target.z = beatZ;

      return true;
    }

    return false;
  }
}
