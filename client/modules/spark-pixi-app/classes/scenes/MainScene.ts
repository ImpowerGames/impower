import {
  Beat,
  EASE,
  Graphic,
  interpolate,
  ReadOnly,
  SparkContext,
  SwipeSymbol,
} from "../../../../../spark-engine";
import {
  generateFrameTexture,
  generateSpritesheet,
} from "../../plugins/animation";
import { Application } from "../../plugins/app";
import { Texture } from "../../plugins/core";
import { generateGrid } from "../../plugins/graphics";
import { Quaternion, Sprite3D } from "../../plugins/projection";
import { SparkScene } from "../SparkScene";

const createSprite = (content: Texture | Texture[], fps?: number): Sprite3D => {
  const sprite = new Sprite3D(content, { fps });
  sprite.play();
  return sprite;
};

const spawn = (
  content?: Texture | Texture[],
  fps?: number,
  positionArray?: Float32Array,
  scale?: number
): Sprite3D => {
  const entity = createSprite(content, fps);
  if (positionArray) {
    entity.position.array = positionArray;
  }
  if (scale !== undefined) {
    entity.scale.x = scale;
    entity.scale.y = scale;
  }
  return entity;
};

const getXOffset = (columnCount: number): number => {
  return -columnCount / 2 + 0.5;
};

const getYOffset = (rowCount: number): number => {
  return 0.25 * rowCount;
};

const createIndicatorCellSprites = (
  rowCount: number,
  columnCount: number,
  cellSize: number,
  indicatorScale: number
): Sprite3D[][] => {
  const indicatorColor = 0xffffff;
  const sprites = [];
  for (let x = 0; x < columnCount; x += 1) {
    for (let y = 0; y < rowCount; y += 1) {
      const sprite = new Sprite3D(Texture.create(cellSize, cellSize));
      sprite.tint = indicatorColor;
      sprite.alpha = 0;
      sprite.position.x = x;
      sprite.position.y = y;
      sprite.scale.x = indicatorScale;
      sprite.scale.y = indicatorScale;
      if (!sprites[x]) {
        sprites[x] = [];
      }
      sprites[x][y] = sprite;
    }
  }
  return sprites;
};

const createIndicatorPaneSprite = (
  rowCount: number,
  columnCount: number,
  z: number,
  parentScaleX: number,
  parentScaleY: number
): Sprite3D => {
  const sprite = new Sprite3D();
  sprite.anchor.set(0.5, 1.0); // Center Bottom
  sprite.position.x = getXOffset(columnCount) / parentScaleX;
  sprite.position.y = getYOffset(rowCount) / parentScaleY;
  sprite.position.z = z;
  sprite.scale.x = 1 / parentScaleX;
  sprite.scale.y = 1 / parentScaleY;
  sprite.alpha = 0;
  return sprite;
};

const getTileAngle = (s: SwipeSymbol): number => {
  switch (s) {
    case "^":
      return 0;
    case "v":
      return 180;
    case ">":
      return 90;
    case "<":
      return 270;
    case "\\":
      return 135;
    case "/":
      return 45;
    default:
      return 0;
  }
};

const getTileColor = (s: SwipeSymbol): number => {
  const blue = 0x006cff;
  switch (s) {
    case "^":
      return blue;
    case "v":
      return blue;
    case ">":
      return blue;
    case "<":
      return blue;
    case "\\":
      return blue;
    case "/":
      return blue;
    default:
      return 0;
  }
};

const createBeat = (
  texture: Texture[],
  maxFPS: number,
  beat: Beat,
  tileScale: number
): Sprite3D => {
  const tileSprite = spawn(texture, maxFPS);
  tileSprite.position.x = beat.x;
  tileSprite.position.y = beat.y;
  tileSprite.position.z = beat.z;
  tileSprite.scale.x = tileScale;
  tileSprite.scale.y = tileScale;
  const angle = getTileAngle(beat.s);
  tileSprite.rotationQuaternion.setEulerAngles(0, 0, angle);
  const color = getTileColor(beat.s);
  tileSprite.tint = color;
  return tileSprite;
};

export class MainScene extends SparkScene {
  private _tileScale = 0.7;

  private _tileRowCount = 3;

  private _tileColumnCount = 4;

  private _gridColor = 0x0000ff;

  private _gridThickness = 1;

  private _gridCellSize = 32;

  private _gridY = 80;

  private _beatMissColor = 0x404040;

  private _playerScale = 2;

  private _indicatorZOffset = -4;

  private _tileZSpacing = 4;

  private _spawnDistance = 5;

  private _spawnEase = EASE.expoIn;

  private _spawnDuration = 0.3;

  private _spawnYOffset = 2;

  private _transitionEase = EASE.expoInOut;

  private _transitionDelay = 0.5;

  private _transitionDuration = 2;

  private _startHeight = 3;

  private _startDistance = 4;

  private _startAngle = 25;

  private _followHeight = 2;

  private _followDistance = 0;

  private _followAngle = 0;

  private _beats: Beat[] = [];

  private _tiles: Beat[] = [];

  private _grids: Sprite3D[] = [];

  private _animationTextures: Record<string, Texture[]> = {};

  private _indicatorTextures: Record<string, Texture> = {};

  private _playerSprite: Sprite3D;

  private _indicatorPaneSprite: Sprite3D;

  private _indicatorCellSprites: Sprite3D[][];

  private _beatSprites: Sprite3D[] = [];

  private _nextTileSprites: Sprite3D[][] = [];

  private _playerPosition = new Float32Array([0, 0, 0]);

  private _floorRotation = new Quaternion().setEulerAngles(-90, 0, 0).array;

  private _tilesPerSecond = 120;

  private _nextTileZ = 0;

  private _scrollActive = true;

  constructor(context: SparkContext, app: Application) {
    super(context, app);
    // Tiles
    const beatmaps = Object.values(
      this.context.game.struct.config.objectMap?.["beatmap"] || {}
    );
    this._beats = beatmaps[0]?.beats as unknown as Beat[];
    this._tiles = this._beats.map((beat) => ({
      x: beat.x + getXOffset(this._tileColumnCount),
      y: beat.y + getYOffset(this._tileRowCount),
      z: -beat.z * this._tileZSpacing,
      s: beat.s,
      bpm: beat.bpm * this._tileZSpacing,
    }));
    this._tilesPerSecond = this._tiles[0].bpm / 60;

    const lastBeat = this._tiles[this._tiles.length - 1];
    // Grid
    const gridTexture = generateGrid(
      this.renderer,
      this._gridThickness,
      this._gridCellSize,
      this._tileColumnCount,
      this._gridY
    );
    const gridHeight = this._tileColumnCount * this._tileZSpacing;
    const numTracks = Math.ceil(Math.abs(lastBeat.z / gridHeight));
    for (let i = 0; i < numTracks; i += 1) {
      const grid = new Sprite3D(gridTexture);
      grid.width = this._tileColumnCount;
      grid.height = this._gridY;
      grid.zIndex = -1000;
      grid.rotationQuaternion.array = this._floorRotation;
      grid.anchor.set(0.5, 1.0); // Center Bottom
      grid.position.x = 0;
      grid.position.y = 0;
      grid.position.z = i * -gridHeight;
      grid.tint = this._gridColor;
      this._grids[i] = grid;
    }
    // Camera
    this.dolly.target.x = this._playerPosition[0];
    this.dolly.target.y = this._startHeight;
    this.dolly.target.z = this._playerPosition[2];
    this.dolly.angles.x = this._startAngle;
    this.dolly.distance = this._startDistance;
    this.dolly.updateCamera();
  }

  override async load(): Promise<void> {
    const graphicMap: Record<string, ReadOnly<Graphic>> = this.context?.game
      ?.struct?.config?.objectMap?.graphic || {};
    await Promise.all(
      Object.entries(graphicMap).map(async ([name, g]) => {
        const src = g.src as unknown as string;
        const svg = await this.assets.load(src);
        if (svg) {
          const outline = generateFrameTexture(
            this.renderer,
            svg,
            0,
            this.maxFPS,
            { fillColor: "none", strokeColor: "#fff" }
          );
          this._indicatorTextures[name] = outline;
          const animationName = "default";
          const sheet = generateSpritesheet(
            this.renderer,
            svg,
            this.maxFPS,
            name,
            animationName,
            { quality: 16 }
          );
          await sheet.parse();
          const textures = sheet.animations[animationName];
          if (textures) {
            this._animationTextures[name] = textures;
          }
        }
      })
    );
  }

  getPlayerAnimationTextures(): Texture[] | undefined {
    const textures = Object.values(this._animationTextures || {});
    return textures[1];
  }

  getObstacleAnimationTextures(): Texture[] | undefined {
    const textures = Object.values(this._animationTextures || {});
    return textures[0];
  }

  getIndicatorTexture(): Texture | undefined {
    const textures = Object.values(this._indicatorTextures || {});
    return textures[0] || undefined;
  }

  override init(): void {
    this._grids.forEach((grid) => {
      this.stage.addChild(grid);
    });
    const playerAnimation = this.getPlayerAnimationTextures();
    const obstacleAnimation = this.getObstacleAnimationTextures();
    if (playerAnimation) {
      this._playerSprite = spawn(
        playerAnimation,
        this.maxFPS,
        this._playerPosition,
        this._playerScale
      );
      this._playerSprite.anchor.set(0.5, 1.0); // Center Bottom
      this._playerSprite.billboardType = "spherical";
      this._indicatorPaneSprite = createIndicatorPaneSprite(
        this._tileRowCount,
        this._tileColumnCount,
        this._indicatorZOffset,
        this._playerSprite.scale.x,
        this._playerSprite.scale.y
      );
      this._indicatorCellSprites = createIndicatorCellSprites(
        this._tileRowCount,
        this._tileColumnCount,
        this._gridCellSize,
        this._tileScale
      );
      this._indicatorCellSprites.forEach((rows, x) => {
        rows.forEach((_, y) => {
          this._indicatorPaneSprite.addChild(this._indicatorCellSprites[x][y]);
        });
      });
      this._playerSprite.addChild(this._indicatorPaneSprite);
      this.stage.addChild(this._playerSprite);
    }

    this._tiles.forEach((beat) => {
      const beatSprite = createBeat(
        obstacleAnimation,
        this.maxFPS,
        beat,
        this._tileScale
      );
      this._beatSprites.push(beatSprite);
      this.stage.addChild(beatSprite);
    });
  }

  override start(): void {
    this.context.game.tween.add("camera", {
      delay: this._transitionDelay,
      duration: this._transitionDuration,
      callback: (progress: number) => {
        if (this.dolly) {
          this.dolly.target.y = interpolate(
            progress,
            this._startHeight,
            this._followHeight,
            this._transitionEase
          );
          this.dolly.angles.x = interpolate(
            progress,
            this._startAngle,
            this._followAngle,
            this._transitionEase
          );
          this.dolly.distance = interpolate(
            progress,
            this._startDistance,
            this._followDistance,
            this._transitionEase
          );
          this._indicatorPaneSprite.alpha = interpolate(
            progress,
            0,
            1,
            this._transitionEase
          );
        }
      },
    });
  }

  override update(_time: number, delta: number): void {
    if (this._scrollActive) {
      this._playerPosition[2] -= this._tilesPerSecond * delta;
      this.dolly.target.x = this._playerPosition[0];
      this.dolly.target.y = this._followHeight;
      this.dolly.target.z = this._playerPosition[2];
      this.dolly.updateCamera();
    }
    if (this._playerSprite) {
      this._playerSprite.position.array = this._playerPosition;
      this._playerSprite.update(delta);
    }

    for (let x = 0; x < this._nextTileSprites.length; x += 1) {
      const row = this._nextTileSprites[x];
      if (row) {
        for (let y = 0; y < row.length; y += 1) {
          this._nextTileSprites[x][y] = undefined;
        }
      }
    }
    this._nextTileZ = 0;
    this._beatSprites.forEach((sprite, i) => {
      const beat = this._beats[i];
      const planeZ = this._playerSprite.position.z + this._indicatorZOffset;
      const spriteZ = sprite.position.z;
      if (planeZ < spriteZ) {
        // Beat is behind player
        sprite.tint = this._beatMissColor;
      } else {
        // Beat is in front of player
        if (!this._nextTileZ && spriteZ < this._nextTileZ) {
          this._nextTileZ = spriteZ;
        }
        if (spriteZ === this._nextTileZ) {
          if (!this._nextTileSprites[beat.x]) {
            this._nextTileSprites[beat.x] = [];
          }
          if (!this._nextTileSprites[beat.x][beat.y]) {
            this._nextTileSprites[beat.x][beat.y] = sprite;
          }
        }
        // Only show beats that are close to player
        if (planeZ - this._spawnDistance * this._tileZSpacing < spriteZ) {
          const key = `beat-${i}`;
          if (!this.context.game.tween.get(key)) {
            const endY = sprite.position.y;
            const startY = sprite.position.y + this._spawnYOffset;
            sprite.position.y = startY;
            this.context.game.tween.add(key, {
              duration: this._spawnDuration,
              callback: (progress: number) => {
                if (sprite) {
                  sprite.alpha = interpolate(progress, 0, 1, this._spawnEase);
                  sprite.position.y = interpolate(
                    progress,
                    startY,
                    endY,
                    this._spawnEase
                  );
                }
              },
            });
          }
        } else {
          sprite.alpha = 0;
        }
      }
      sprite.renderable = sprite.isInCameraFrustum(this.dolly.camera);
      sprite.update(delta);
    });
    for (let x = 0; x < this._indicatorCellSprites.length; x += 1) {
      const row = this._indicatorCellSprites[x];
      if (row) {
        for (let y = 0; y < row.length; y += 1) {
          const indicatorSprite = this._indicatorCellSprites[x][y];
          if (indicatorSprite) {
            const nextTileSprite = this._nextTileSprites?.[x]?.[y];
            if (nextTileSprite) {
              const indicatorTexture = this.getIndicatorTexture();
              indicatorSprite.texture = indicatorTexture;
              indicatorSprite.rotationQuaternion =
                nextTileSprite.rotationQuaternion;
              indicatorSprite.tint = 0xffffff;
              indicatorSprite.alpha = 1;
            } else {
              indicatorSprite.alpha = 0;
            }
          }
        }
      }
    }
  }

  override onTap(_event: PointerEvent): void {
    this._scrollActive = !this._scrollActive;
  }
}
