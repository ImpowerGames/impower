import * as PIXI from "pixi.js";
import { generateSpritesheet } from "../../utils/generateSpritesheet";
import { Scene } from "../Scene";
import { SVGLoader } from "../SVGLoader";
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

export class MainScene extends Scene {
  private _camera: SparkCamera;

  private _debug: PIXI.Graphics;

  private _surfaceContainer: SparkContainer;

  private _entityContainer: SparkContainer;

  private _animations: Record<string, PIXI.Texture[]> = {};

  private _sprites: PIXI.AnimatedSprite[] = [];

  private _sortGroup: SparkGroup;

  private _ang = 0;

  async init(): Promise<void> {
    const svgEntries = Object.entries(
      this.sparkContext?.game?.logic?.blockMap?.[""]?.variables || {}
    ).filter(([, v]) => v.type === "graphic");
    await Promise.all(
      svgEntries.map(async ([, v]) => {
        const svg = await SVGLoader.instance.load(v.value as string);
        const animationName = "default";
        const sheet = generateSpritesheet(
          svg,
          this.app.renderer,
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

  start(): void {
    const surfaceTexture = new PIXI.Texture(PIXI.Texture.WHITE.baseTexture);
    surfaceTexture.orig.width = 500;
    surfaceTexture.orig.height = 500;

    const surfaceHandleTexture = new PIXI.Texture(
      PIXI.Texture.WHITE.baseTexture
    );
    surfaceHandleTexture.orig.width = 25;
    surfaceHandleTexture.orig.height = 25;

    const spriteHandleTexture = new PIXI.Texture(
      PIXI.Texture.WHITE.baseTexture
    );
    spriteHandleTexture.orig.width = 50;
    spriteHandleTexture.orig.height = 50;

    this._camera = new SparkCamera();
    this._camera.euler.y = this._ang;
    this._camera.euler.x = -Math.PI / 6;
    this._camera.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2
    );
    this._camera.setPlanes(1000, 10, 10000, true);
    this.app.stage.addChild(this._camera);

    this._entityContainer = new SparkContainer();
    this._surfaceContainer = new SparkContainer();
    this._camera.addChild(this._surfaceContainer);
    this._camera.addChild(this._entityContainer);

    this._sortGroup = new SparkGroup(1, true);
    this._sortGroup.on("sort", (plane: SparkContainer) => {
      plane.zOrder = -plane.getDepth();
    });
    this.app.stage.addChild(new SparkLayer(this._sortGroup));
    this._debug = new PIXI.Graphics();
    this.app.stage.addChild(this._debug);

    const spawnAnimatedSprite = (
      content: PIXI.Texture[],
      scale: number,
      sortGroup: SparkGroup,
      maxFPS: number
    ): SparkContainer => {
      const time = 1000 / maxFPS; // Duration of each frame in ms
      const entity = new PIXI.AnimatedSprite(
        content.map((texture) => ({ texture, time })),
        false
      );
      entity.play();
      entity.anchor.set(0.5, 1.0); // Center Bottom
      this._sprites.push(entity);

      return spawn(entity, scale, sortGroup);
    };

    Object.entries(this._animations || {}).forEach(([, v]) => {
      const sprite = spawnAnimatedSprite(
        v,
        0.25,
        this._sortGroup,
        this.app.ticker.maxFPS
      );

      sprite.position3d.x = 0;
      sprite.position3d.z = 0;

      this._entityContainer.addChild(sprite);
    });

    const earth = new SparkSprite(surfaceTexture);
    earth.euler.x = Math.PI / 2;
    earth.anchor.x = earth.anchor.y = 0.5;
    this._surfaceContainer.addChild(earth);

    this._surfaceContainer.interactive = true;
    this._surfaceContainer.on("click", (event) => {
      const p = new PIXI.Point();
      event.data.getLocalPosition(earth, p, event.data.global);
      const sprite = spawnAnimatedSprite(
        Object.values(this._animations || {})[0],
        0.25,
        this._sortGroup,
        this.app.ticker.maxFPS
      );
      sprite.position3d.x = p.x;
      sprite.position3d.z = p.y;
      this._entityContainer.addChild(sprite);
    });
  }

  update(_time: number, delta: number): void {
    if (this.sparkContext.game.debug.state.debugging) {
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
    this._ang += 0.01;
    this._camera.euler.y = this._ang;
    this._camera.euler.x = -Math.PI / 6;

    // ROTATE SPRITES TO FACE CAMERA
    this._entityContainer.children.forEach((plane: SparkContainer) => {
      if (plane.alwaysFront) {
        const child = plane.children[0] as SparkContainer;
        // 1. rotate sprite plane to the camera
        child.euler.x = -Math.PI / 6;
        // 2. rotate sprite to the camera
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
