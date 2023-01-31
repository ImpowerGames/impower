import { Graphic, ReadOnly, SparkContext } from "../../../../../spark-engine";
import { generateSpritesheet } from "../../plugins/animated-graphics";
import {
  SparkCameraOrbitControl,
  SparkContainer,
  SparkPlane,
  SparkPoint3D,
  SparkSprite,
} from "../../plugins/projection";
import { generateGrid } from "../../plugins/shape-graphics";
import { SparkScene } from "../SparkScene";
import { SparkApplication } from "../wrappers/SparkApplication";
import { SparkTexture } from "../wrappers/SparkTexture";

const createSprite = (content: SparkTexture[], fps: number): SparkSprite => {
  const sprite = new SparkSprite(content, { fps });
  sprite.pivot.set(0.5, 1.0); // Center Bottom
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
  entityContainer: SparkContainer,
  entities: SparkSprite[],
  positionArray?: Float32Array,
  scaleArray?: Float32Array
): void => {
  const entity = createSprite(content, fps);
  entity.pixelsPerUnit = entity.texture.width;
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

  private _grid: SparkSprite;

  private _animations: Record<string, SparkTexture[]> = {};

  private _entities: SparkSprite[] = [];

  private _cameraAngleX = 25;

  private _gridColor = 0x0000ff;

  private _gridThickness = 4;

  private _gridCellSize = 32;

  private _gridRowCount = 4;

  private _gridColumnCount = 32;

  private _floorPlane = new SparkPlane(new SparkPoint3D(0, 1, 0), 0);

  private _pointerDown = false;

  private _pointerDownX = 0;

  private _pointerDownY = 0;

  private _dragging = false;

  private _dragThreshold = 8;

  private _defaultPosition = new Float32Array(3);

  constructor(context: SparkContext, app: SparkApplication) {
    super(context, app);
    // Camera
    this._cameraControl = new SparkCameraOrbitControl(this.view);
    this._cameraControl.angles.x = this._cameraAngleX;
    // Grid
    const gridTexture = generateGrid(
      this.renderer,
      this._gridColor,
      this._gridThickness,
      this._gridCellSize,
      this._gridRowCount,
      this._gridColumnCount
    );
    this._grid = new SparkSprite(gridTexture);
    this._grid.zIndex = -1000;
    this._grid.rotationQuaternion.setEulerAngles(90, 0, 0);
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
    this.stage.addChild(this._grid);
    this._defaultPosition[0] = 0;
    this._defaultPosition[1] = 0;
    this._defaultPosition[2] = 3;
    Object.entries(this._animations || {}).forEach(([, v]) => {
      if (v) {
        spawn(
          v,
          this.maxFPS,
          this.stage,
          this._entities,
          this._defaultPosition
        );
      }
    });
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
    this._entities.forEach((entity) => {
      entity.update(delta);
    });
  }
}
