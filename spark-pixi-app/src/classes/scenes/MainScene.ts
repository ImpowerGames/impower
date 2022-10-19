import * as PIXI from "pixi.js";
import {
  generateSpritesheet,
  SVGLoader,
} from "../../plugins/animated-graphics";
import { generateGrid } from "../../plugins/editor-graphics";
import { SparkScene } from "../SparkScene";
import { SparkCamera } from "../wrappers/SparkCamera";
import { SparkContainer } from "../wrappers/SparkContainer";
import { SparkGroup } from "../wrappers/SparkGroup";
import { SparkLayer } from "../wrappers/SparkLayer";
import { SparkSprite } from "../wrappers/SparkSprite";

const spawn = (
  obj: PIXI.DisplayObject,
  scale: number,
  sortGroup: SparkGroup
): SparkContainer => {
  obj.interactive = false;
  obj.interactiveChildren = false;

  const container = new SparkContainer();
  container.pivot.set(0.5, 1.0); // Center Bottom
  container.scale3d.x = scale;
  container.scale3d.y = scale;
  container.interactive = false;
  container.interactiveChildren = false;

  const plane = new SparkContainer();
  plane.pivot.set(0.5, 1.0); // Center Bottom
  plane.parentGroup = sortGroup;
  plane.interactive = false;
  plane.interactiveChildren = false;
  plane.alwaysFront = true;

  container.addChild(obj);
  plane.addChild(container);

  return plane;
};

const spawnAnimatedSprite = (
  content: PIXI.Texture[],
  scale: number,
  sortGroup: SparkGroup,
  maxFPS: number,
  sprites: PIXI.AnimatedSprite[]
): SparkContainer => {
  const time = 1000 / maxFPS; // Duration of each frame in ms
  const entity = new PIXI.AnimatedSprite(
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

  private _debug: PIXI.Graphics;

  private _surfaceContainer: SparkContainer;

  private _entityContainer: SparkContainer;

  private _earth: SparkSprite;

  private _animations: Record<string, PIXI.Texture[]> = {};

  private _sprites: PIXI.AnimatedSprite[] = [];

  private _sortGroup: SparkGroup;

  private _ang = 0;

  async load(): Promise<void> {
    const svgEntries = Object.entries(
      this.context?.game?.logic?.blockMap?.[""]?.variables || {}
    ).filter(([, v]) => v.type === "graphic");
    await Promise.all(
      svgEntries.map(async ([, v]) => {
        const svg = await SVGLoader.instance.load(v.value as string);
        const animationName = "default";
        const sheet = generateSpritesheet(
          this.app.renderer,
          svg,
          this.app.ticker.maxFPS,
          v.name,
          animationName
        );
        await sheet.parse();
        this._animations[v.name] = sheet.animations[animationName];
        return svg;
      })
    );
  }

  init(): void {
    // Grid Settings
    const gridColor = 0x0000ff;
    const gridThickness = 4;
    const gridCellSize = 32;
    const gridRowCount = 10;

    // Camera Settings
    const near = 10;
    const far = 1000;
    const focus = far - 100;
    const orthographic = false;
    const x = this.app.screen.width / 2;
    const y = this.app.screen.height / 2;

    this._camera = new SparkCamera();
    this._camera.euler.y = this._ang;
    this._camera.euler.x = -Math.PI / 6;
    this._camera.position.set(x, y);
    this._camera.setPlanes(focus, near, far, orthographic);
    this.app.stage.addChild(this._camera);

    this._surfaceContainer = new SparkContainer();
    this._surfaceContainer.interactive = true;
    this._camera.addChild(this._surfaceContainer);

    this._entityContainer = new SparkContainer();
    this._camera.addChild(this._entityContainer);

    this._sortGroup = new SparkGroup(1, true);
    this.app.stage.addChild(new SparkLayer(this._sortGroup));

    this._debug = new PIXI.Graphics();
    this.app.stage.addChild(this._debug);

    const gridTexture = generateGrid(
      this.app.renderer,
      gridColor,
      gridThickness,
      gridCellSize,
      gridRowCount
    );

    this._earth = new SparkSprite(gridTexture);
    this._earth.euler.x = Math.PI / 2;
    this._earth.anchor.x = 0.5;
    this._earth.anchor.y = 0.5;
    this._surfaceContainer.addChild(this._earth);

    Object.entries(this._animations || {}).forEach(([k, v]) => {
      const sprite = spawnAnimatedSprite(
        v,
        1,
        this._sortGroup,
        this.app.ticker.maxFPS,
        this._sprites
      );

      sprite.position3d.x = 0;
      sprite.position3d.z = 0;

      this._entityContainer.addChild(sprite);
      this.entities[k] = sprite;
    });
  }

  start(): void {
    this._surfaceContainer.on("click", (event) => {
      const p = new PIXI.Point();
      event.data.getLocalPosition(this._earth, p, event.data.global);
      const [firstKey, firstValue] =
        Object.entries(this._animations || {})[0] || [];
      if (firstValue) {
        const sprite = spawnAnimatedSprite(
          firstValue,
          1,
          this._sortGroup,
          this.app.ticker.maxFPS,
          this._sprites
        );
        sprite.position3d.x = p.x;
        sprite.position3d.z = p.y;
        this._entityContainer.addChild(sprite);
        this.entities[firstKey] = sprite;
      }
    });

    this._sortGroup.on("sort", (plane: SparkContainer) => {
      plane.zOrder = -plane.getDepth();
    });
  }

  update(_time: number, delta: number): void {
    if (this.context.game.debug.state.debugging) {
      // SHOW SPRITE BOUNDS DEBUG BOX
      this._debug.clear();
      this._debug.lineStyle(2, 0x0000ff, 1.0);
      this._entityContainer.children.forEach((plane: SparkContainer) => {
        const rect = plane.getBounds();
        if (rect !== PIXI.Rectangle.EMPTY) {
          this._debug.drawShape(rect);
        }
      });
    }

    // ROTATE CAMERA
    if (!this.context.editable) {
      this._ang += 0.01;
    }
    this._camera.euler.y = this._ang;
    this._camera.euler.x = -Math.PI / 6;

    // ROTATE SPRITES TO FACE CAMERA
    this._entityContainer.children.forEach((plane: SparkContainer) => {
      if (plane.alwaysFront) {
        const child = plane.children[0] as SparkContainer;
        // 1. rotate sprite to the camera
        child.euler.x = -Math.PI / 6;
        // 2. rotate plane to the camera
        plane.euler.y = this._ang;

        const sprite = child.children[0] as PIXI.AnimatedSprite;
        sprite.update(delta / 1000);
      }
    });

    // updateTransform BEFORE the sorting will be called
    this._camera.updateTransform();
  }

  resize(): void {
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
