import {
  Beat,
  Graphic,
  ReadOnly,
  SparkContext,
} from "../../../../../spark-engine";
import { generateSpritesheet } from "../../plugins/animated-graphics";
import { SparkSprite } from "../../plugins/projection";
import { SparkQuaternion } from "../../plugins/projection/classes/SparkQuaternion";
import { generateGrid } from "../../plugins/shape-graphics";
import { SparkScene } from "../SparkScene";
import { SparkApplication } from "../wrappers/SparkApplication";
import { SparkTexture } from "../wrappers/SparkTexture";

const createSprite = (
  content: SparkTexture | SparkTexture[],
  fps?: number
): SparkSprite => {
  const sprite = new SparkSprite(content, { fps });
  sprite.anchor.set(0.5, 1.0); // Center Bottom
  sprite.play();
  return sprite;
};

const spawn = (
  content?: SparkTexture | SparkTexture[],
  fps?: number,
  positionArray?: Float32Array,
  scale?: number
): SparkSprite => {
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

export class MainScene extends SparkScene {
  private _grids: SparkSprite[] = [];

  private _animations: Record<string, SparkTexture[]> = {};

  private _playerSprite: SparkSprite;

  private _tileSprites: SparkSprite[] = [];

  private _tileColor = 0xff0000;

  private _indicatorColor = 0xffffff;

  private _indicatorAlpha = 0.1;

  private _gridColor = 0x0000ff;

  private _indicatorScale = 0.9;

  private _tileScale = 0.85;

  private _tileRowCount = 3;

  private _tileColumnCount = 4;

  private _gridThickness = 1;

  private _gridCellSize = 32;

  private _gridY = 80;

  private _floorRotation = new SparkQuaternion().setEulerAngles(-90, 0, 0)
    .array;

  private _playerPosition = new Float32Array([0, 0, 0]);

  private _playerScale = 2;

  private _playerSpeed = 0.2;

  private _followDistance = 4;

  private _followHeight = 2;

  private _followAngle = 0;

  private _zSpacingScale = 2;

  private _tiles: Beat[] = [];

  private _scroll = true;

  constructor(context: SparkContext, app: SparkApplication) {
    super(context, app);
    // Tiles
    const beatmaps = Object.values(
      this.context.game.struct.config.objectMap?.["beatmap"] || {}
    );
    this._tiles = (beatmaps[0]?.beats as unknown as Beat[]).map((beat) => ({
      x: beat.x + getXOffset(this._tileColumnCount),
      y: beat.y + getYOffset(this._tileRowCount),
      z: -beat.z * this._zSpacingScale,
    }));
    const lastTile = this._tiles[this._tiles.length - 1];
    // Grid
    const gridTexture = generateGrid(
      this.renderer,
      this._gridThickness,
      this._gridCellSize,
      this._tileColumnCount,
      this._gridY
    );
    const numTracks = Math.ceil(Math.abs(lastTile.z / this._tileColumnCount));
    for (let i = 0; i < numTracks; i += 1) {
      const grid = new SparkSprite(gridTexture);
      grid.width = this._tileColumnCount;
      grid.height = this._gridY;
      grid.zIndex = -1000;
      grid.rotationQuaternion.array = this._floorRotation;
      grid.anchor.set(0.5, 1.0); // Center Bottom
      grid.position.x = 0;
      grid.position.y = 0;
      grid.position.z = i * -this._gridCellSize;
      grid.tint = this._gridColor;
      this._grids[i] = grid;
    }
    // Camera
    this.dolly.target.x = this._playerPosition[0];
    this.dolly.target.y = this._followHeight;
    this.dolly.target.z = this._playerPosition[2];
    this.dolly.angles.x = this._followAngle;
    this.dolly.distance = this._followDistance;
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
          const animationName = "default";
          const sheet = generateSpritesheet(
            this.renderer,
            svg,
            this.maxFPS,
            name,
            animationName
          );
          await sheet.parse();
          const textures = sheet.animations[animationName];
          if (textures) {
            this._animations[name] = textures;
          }
        }
      })
    );
  }

  override init(): void {
    this._grids.forEach((grid) => {
      this.stage.addChild(grid);
    });
    const animations = Object.values(this._animations || {});
    const firstAnimation = animations[0];
    if (firstAnimation) {
      this._playerSprite = spawn(
        firstAnimation,
        this.maxFPS,
        this._playerPosition,
        this._playerScale
      );
      this._playerSprite.billboardType = "spherical";
      this._playerSprite.interactive = false;
      this._playerSprite.interactiveChildren = false;
      const indicatorPaneSprite = new SparkSprite();
      indicatorPaneSprite.anchor.set(0.5, 1.0); // Center Bottom
      for (let y = 0; y < this._tileRowCount; y += 1) {
        for (let x = 0; x < this._tileColumnCount; x += 1) {
          const indicatorSprite = new SparkSprite(
            SparkTexture.create(this._gridCellSize, this._gridCellSize)
          );
          indicatorSprite.tint = this._indicatorColor;
          indicatorSprite.alpha = this._indicatorAlpha;
          indicatorSprite.position.x = x;
          indicatorSprite.position.y = y;
          indicatorSprite.scale.x = this._indicatorScale;
          indicatorSprite.scale.y = this._indicatorScale;
          indicatorPaneSprite.addChild(indicatorSprite);
        }
      }
      indicatorPaneSprite.position.x =
        getXOffset(this._tileColumnCount) / this._playerScale;
      indicatorPaneSprite.position.y =
        getYOffset(this._tileRowCount) / this._playerScale;
      indicatorPaneSprite.position.z = -1;
      indicatorPaneSprite.scale.x = 1 / this._playerScale;
      indicatorPaneSprite.scale.y = 1 / this._playerScale;
      this._playerSprite.addChild(indicatorPaneSprite);
      this.stage.addChild(this._playerSprite);
    }

    this._tiles.forEach((tile) => {
      const tileSprite = new SparkSprite(SparkTexture.create());
      tileSprite.tint = this._tileColor;
      tileSprite.position.x = tile.x;
      tileSprite.position.y = tile.y;
      tileSprite.position.z = tile.z;
      tileSprite.scale.x = this._tileScale;
      tileSprite.scale.y = this._tileScale;
      tileSprite.billboardType = "cylindrical";
      this._tileSprites.push(tileSprite);
      this.stage.addChild(tileSprite);
    });
  }

  override update(_time: number, delta: number): void {
    if (this._scroll) {
      this._playerPosition[2] -= this.maxFPS * this._playerSpeed * delta;
      this.dolly.target.x = this._playerPosition[0];
      this.dolly.target.y = this._followHeight;
      this.dolly.target.z = this._playerPosition[2];
      this.dolly.updateCamera();
    }
    this._playerSprite.position.array = this._playerPosition;
    this._playerSprite.update(delta);
    this._tileSprites.forEach((entity) => {
      entity.update(delta);
    });
  }
}
