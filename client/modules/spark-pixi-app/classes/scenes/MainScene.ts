import {
  Beat,
  Graphic,
  ReadOnly,
  SparkContext,
} from "../../../../../spark-engine";
import { generateSpritesheet } from "../../plugins/animated-graphics";
import {
  SparkCameraOrbitControl,
  SparkContainer,
  SparkPlane,
  SparkPoint3D,
  SparkSprite,
} from "../../plugins/projection";
import { SparkQuaternion } from "../../plugins/projection/classes/SparkQuaternion";
import { generateGrid } from "../../plugins/shape-graphics";
import { SparkScene } from "../SparkScene";
import { SparkApplication } from "../wrappers/SparkApplication";
import { SparkTexture } from "../wrappers/SparkTexture";

const createWhiteTexture = (width: number, height: number): SparkTexture => {
  const texture = SparkTexture.WHITE.clone();
  texture.orig.width = width;
  texture.orig.height = height;
  return texture;
};

const createSprite = (
  content: SparkTexture[],
  fps: number,
  pixelsPerUnit: number
): SparkSprite => {
  const sprite = new SparkSprite(content, { fps });
  sprite.pixelsPerUnit = pixelsPerUnit;
  sprite.anchor.set(0.5, 1.0); // Center Bottom
  sprite.billboardType = "cylindrical";
  sprite.interactive = false;
  sprite.interactiveChildren = false;
  sprite.play();
  return sprite;
};

const spawn = (
  content: SparkTexture[],
  fps: number,
  pixelsPerUnit: number,
  entityContainer: SparkContainer,
  entities: SparkSprite[],
  positionArray?: Float32Array,
  scaleArray?: Float32Array
): void => {
  const entity = createSprite(content, fps, pixelsPerUnit);
  if (positionArray) {
    entity.position.array = positionArray;
  }
  if (scaleArray) {
    entity.scale.array = scaleArray;
  }
  entityContainer.addChild(entity);
  entities.push(entity);
};

export class MainScene extends SparkScene {
  private _cameraControl: SparkCameraOrbitControl;

  private _map: SparkSprite;

  private _grids: SparkSprite[] = [];

  private _animations: Record<string, SparkTexture[]> = {};

  private _entities: SparkSprite[] = [];

  private _pixelsPerUnit = 32;

  private _cameraAngleX = 0;

  private _cameraAngleY = 180;

  private _cameraTargetX = 0;

  private _cameraTargetY = 1;

  private _cameraTargetZ = 0;

  private _cameraDistance = 4;

  private _cameraFieldOfView = 60;

  private _cameraNear = 0.01;

  private _cameraFar = 1000;

  private _cameraSpeed = 0.2;

  private _gridColor = 0x0000ff;

  private _mapColor = 0xff0000;

  private _gridThickness = 1;

  private _gridCellSize = 32;

  private _gridRowCount = 4;

  private _gridColumnCount = 80;

  private _floorRotation = new SparkQuaternion().setEulerAngles(-90, 0, 0)
    .array;

  private _floorPlane = new SparkPlane(new SparkPoint3D(0, 1, 0), 0);

  private _pointerDown = false;

  private _pointerDownX = 0;

  private _pointerDownY = 0;

  private _dragging = false;

  private _dragThreshold = 8;

  private _tileScaleZ = 2;

  private _position = new Float32Array([0, 0, 0]);

  private _tiles: Beat[] = [];

  private _scroll = true;

  constructor(context: SparkContext, app: SparkApplication) {
    super(context, app);
    // Tiles
    const beatmaps = Object.values(
      this.context.game.struct.config.objectMap?.["beatmap"] || {}
    );
    this._tiles = (beatmaps[0]?.beats as unknown as Beat[]).map((beat) => ({
      x: beat.x - this._gridRowCount / 2 + 0.5,
      y: beat.y,
      z: -beat.z * this._tileScaleZ,
    }));
    const firstTile = this._tiles[0];
    const lastTile = this._tiles[this._tiles.length - 1];
    // Map
    this._map = new SparkSprite(createWhiteTexture(1, this._pixelsPerUnit));
    this._map.pixelsPerUnit = this._pixelsPerUnit;
    this._map.tint = this._mapColor;
    // Grid
    const gridTexture = generateGrid(
      this.renderer,
      this._gridThickness,
      this._gridCellSize,
      this._gridRowCount,
      this._gridColumnCount
    );
    const numTracks = Math.ceil(Math.abs(lastTile.z / this._gridRowCount));
    for (let i = 0; i < numTracks; i += 1) {
      const grid = new SparkSprite(gridTexture);
      grid.pixelsPerUnit = this._pixelsPerUnit;
      grid.width = this._gridRowCount;
      grid.height = this._gridColumnCount;
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
    this._cameraTargetZ = firstTile.z;
    this._cameraControl = new SparkCameraOrbitControl(this.view);
    this._cameraControl.angles.x = this._cameraAngleX;
    this._cameraControl.angles.y = this._cameraAngleY;
    this._cameraControl.target.x = this._cameraTargetX;
    this._cameraControl.target.y = this._cameraTargetY;
    this._cameraControl.target.z = this._cameraTargetZ;
    this._cameraControl.distance = this._cameraDistance;
    this._cameraControl.camera.fieldOfView = this._cameraFieldOfView;
    this._cameraControl.camera.near = this._cameraNear;
    this._cameraControl.camera.far = this._cameraFar;
    this._cameraControl.updateCamera();
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
    this.stage.addChild(this._map);
    this._grids.forEach((grid) => {
      this._map.addChild(grid);
    });
    const animations = Object.values(this._animations || {});
    const firstAnimation = animations[0];
    if (firstAnimation) {
      this._tiles.forEach((tile) => {
        this._position[0] = tile.x;
        this._position[1] = tile.y;
        this._position[2] = tile.z;
        spawn(
          firstAnimation,
          this.maxFPS,
          this._pixelsPerUnit,
          this._map,
          this._entities,
          this._position
        );
      });
    }
  }

  override start(): void {
    // Click to spawn an entity
    this.view.addEventListener("pointerdown", (event) => {
      this._pointerDown = true;
      this._dragging = false;
      this._pointerDownX = event.offsetX;
      this._pointerDownY = event.offsetY;
    });
    this.view.addEventListener("pointermove", (event) => {
      if (this._pointerDown) {
        const pointerX = event.offsetX;
        const pointerY = event.offsetY;
        const dragDistance =
          (pointerX - this._pointerDownX) ** 2 +
          (pointerY - this._pointerDownY) ** 2;
        if (dragDistance > this._dragThreshold) {
          this._dragging = true;
        }
      }
    });
    this.view.addEventListener("pointerup", (event) => {
      const pointerX = event.offsetX;
      const pointerY = event.offsetY;
      if (this._pointerDown && !this._dragging) {
        const ray = this._cameraControl.camera.screenToRay(pointerX, pointerY);
        const distance = this._floorPlane.rayCast(ray);
        const point = ray.getPoint(distance);
        if (point) {
          const [firstKey, firstValue] =
            Object.entries(this._animations || {})[0] || [];
          if (firstKey !== undefined && firstValue !== undefined) {
            spawn(
              firstValue,
              this.maxFPS,
              this._pixelsPerUnit,
              this.stage,
              this._entities,
              point.array
            );
          }
        }
      }
      this._pointerDown = false;
      this._dragging = false;
    });
  }

  override update(_time: number, delta: number): void {
    if (this._scroll) {
      this._cameraControl.target.z -= this.maxFPS * this._cameraSpeed * delta;
      this._cameraControl.updateCamera();
    }
    this._entities.forEach((entity) => {
      entity.update(delta);
    });
  }
}
