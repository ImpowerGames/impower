import {
  AnimatedSprite,
  DisplayObject,
  Graphics,
  Rectangle,
  Renderer,
  Texture,
} from "pixi.js";
import { SpriteBillboardType } from "pixi3d";
import { SparkContext } from "../../../../../spark-engine";
import {
  generateSpritesheet,
  SVGLoader,
} from "../../plugins/animated-graphics";
import { generateGrid } from "../../plugins/editor-graphics";
import { SparkScene } from "../SparkScene";
import { SparkApplication } from "../wrappers/SparkApplication";
import { SparkCamera } from "../wrappers/SparkCamera";
import { SparkCameraOrbitControl } from "../wrappers/SparkCameraOrbitControl";
import { SparkContainer } from "../wrappers/SparkContainer";
import { SparkGroup } from "../wrappers/SparkGroup";
import { SparkLayer } from "../wrappers/SparkLayer";
import { SparkSprite } from "../wrappers/SparkSprite";

const spawn = (
  obj: DisplayObject,
  scale: number,
  sortGroup: SparkGroup
): SparkSprite => {
  obj.interactive = false;
  obj.interactiveChildren = false;

  const container = new SparkContainer();
  container.pivot.set(0.5, 1.0); // Center Bottom
  container.scale.x = scale;
  container.scale.y = scale;
  container.interactive = false;
  container.interactiveChildren = false;

  const plane = new SparkSprite();
  plane.pivot.set(0.5, 1.0); // Center Bottom
  plane.parentGroup = sortGroup;
  plane.interactive = false;
  plane.interactiveChildren = false;
  plane.billboardType = SpriteBillboardType.spherical;

  container.addChild(obj);
  plane.addChild(container);

  return plane;
};

const spawnAnimatedSprite = (
  content: Texture[],
  scale: number,
  sortGroup: SparkGroup,
  maxFPS: number,
  sprites: AnimatedSprite[]
): SparkSprite => {
  const time = 1000 / maxFPS; // Duration of each frame in ms
  const entity = new AnimatedSprite(
    content.map((texture) => ({ texture, time })),
    false
  );
  entity.play();
  entity.anchor.set(0.5, 1.0); // Center Bottom
  sprites.push(entity);

  return spawn(entity, scale, sortGroup);
};

export class MainScene extends SparkScene {
  private _camera: SparkCamera;

  private _debug: Graphics;

  private _surfaceContainer: SparkContainer;

  private _entityContainer: SparkContainer;

  private _earth: SparkSprite;

  private _sortGroup: SparkGroup;

  private _animations: Record<string, Texture[]> = {};

  private _sprites: AnimatedSprite[] = [];

  private _ang = 0;

  constructor(
    context: SparkContext,
    app: SparkApplication,
    entities: Record<string, SparkSprite>
  ) {
    super(context, app, entities);

    // Grid Settings
    const gridColor = 0x0000ff;
    const gridThickness = 4;
    const gridCellSize = 32;
    const gridRowCount = 10;

    // Camera Settings
    const distance = 3.5;
    const x = this.app.screen.width / 2;
    const y = this.app.screen.height / 2;

    const control = new SparkCameraOrbitControl(
      this.app.view as HTMLCanvasElement
    );

    this._camera = new SparkCamera(this.app.renderer as Renderer);
    control.angles.y = this._ang;
    control.angles.x = -Math.PI / 6;
    this._camera.position.set(x, y);
    control.distance = distance;

    const gridTexture = generateGrid(
      this.app.renderer,
      gridColor,
      gridThickness,
      gridCellSize,
      gridRowCount
    );
    this._earth = new SparkSprite(gridTexture);
    this._earth.rotationQuaternion.x = Math.PI / 2;
    this._earth.anchor.x = 0.5;
    this._earth.anchor.y = 0.5;

    this._surfaceContainer = new SparkContainer();
    this._surfaceContainer.interactive = true;

    this._entityContainer = new SparkContainer();
    this._entityContainer.sortableChildren = true;

    this._sortGroup = new SparkGroup(1, true);

    this._debug = new Graphics();

    Object.entries(this._animations || {}).forEach(([k, v]) => {
      if (v) {
        const sprite = spawnAnimatedSprite(
          v,
          1,
          this._sortGroup,
          this.app.ticker.maxFPS,
          this._sprites
        );
        sprite.position.x = 0;
        sprite.position.z = 0;
        this.entities[k] = sprite;
      }
    });
  }

  override async load(): Promise<void> {
    const imageEntries = Object.entries(
      this.context?.game?.logic?.config?.blockMap?.[""]?.variables || {}
    ).filter(([, v]) => v.type.startsWith("image"));
    await Promise.all(
      imageEntries.map(async ([, v]) => {
        const svg = await SVGLoader.instance.load(v.value as string);
        if (svg) {
          const animationName = "default";
          const sheet = generateSpritesheet(
            this.app.renderer,
            svg,
            this.app.ticker.maxFPS,
            v.name,
            animationName
          );
          await sheet.parse();
          const animation = sheet.animations[animationName];
          if (animation) {
            this._animations[v.name] = animation;
          }
        }
        return svg;
      })
    );
  }

  override init(): void {
    this.app.stage.addChild(this._camera);
    this.app.stage.addChild(new SparkLayer(this._sortGroup));
    this.app.stage.addChild(this._debug);
    this._camera.addChild(this._surfaceContainer);
    this._camera.addChild(this._entityContainer);
    this._surfaceContainer.addChild(this._earth);
    Object.entries(this.entities).forEach(([, sprite]) => {
      this._entityContainer.addChild(sprite);
    });
  }

  override start(): void {
    this._surfaceContainer.on("click", (event) => {
      const [firstKey, firstValue] =
        Object.entries(this._animations || {})[0] || [];
      if (firstKey !== undefined && firstValue !== undefined) {
        const sprite = spawnAnimatedSprite(
          firstValue,
          1,
          this._sortGroup,
          this.app.ticker.maxFPS,
          this._sprites
        );
        sprite.position.x = event.global.x;
        sprite.position.z = event.global.y;
        this._entityContainer.addChild(sprite);
        this.entities[firstKey] = sprite;
      }
    });
  }

  override update(_timeMS: number, deltaMS: number): void {
    if (this.context.game.debug.state.debugging) {
      // SHOW SPRITE BOUNDS DEBUG BOX
      this._debug.clear();
      this._debug.lineStyle(2, 0x0000ff, 1.0);
      if (this._entityContainer) {
        this._entityContainer.children.forEach((plane: DisplayObject) => {
          const rect = plane.getBounds();
          if (rect !== Rectangle.EMPTY) {
            this._debug.drawShape(rect);
          }
        });
      }
    }

    // ROTATE CAMERA
    if (!this.context.editable) {
      this._ang += 0.01;
    }
    this._camera.rotationQuaternion.y = this._ang;
    this._camera.rotationQuaternion.x = -Math.PI / 6;

    // ROTATE SPRITES TO FACE CAMERA
    this._entityContainer.children.forEach((obj: DisplayObject) => {
      const plane = obj as SparkContainer;
      if (plane.alwaysFront) {
        const child = plane.children[0] as SparkContainer;
        // 1. rotate sprite to the camera
        // child.rotationQuaternion.x = -Math.PI / 6;
        // 2. rotate plane to the camera
        // plane.rotationQuaternion.y = this._ang;

        const sprite = child.children[0] as AnimatedSprite;
        sprite.update(deltaMS / 1000);
        sprite.zIndex = -this._camera.distanceFromCamera(
          child.worldTransform.position.array
        );
      }
    });

    // updateTransform BEFORE the sorting will be called
    this._camera.updateTransform();
  }

  override resize(): void {
    if (this.app) {
      if (this._camera) {
        this._camera.position.set(
          this.app.screen.width / 2,
          this.app.screen.height / 2
        );
      }
    }
  }
}
