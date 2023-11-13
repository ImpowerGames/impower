import { Beat, SparkContext } from "../../../../../spark-engine";
import { generateSpritesheet } from "../../plugins/animation";
import { Application } from "../../plugins/app";
import { Renderer, Texture } from "../../plugins/core";
import {
  createCircleTexture,
  createLineTexture,
  createPillTexture,
} from "../../plugins/graphics";
import {
  Color,
  CompositeSprite,
  Container3D,
  Mesh3D,
  Sprite3D,
  StandardMaterial,
} from "../../plugins/projection";
import { Ticker } from "../../plugins/ticker";
import { SparkAssets } from "../SparkAssets";
import { SparkScene } from "../SparkScene";

type BeatInfo = Beat & {
  hold?: number;
  spawn?: number;
  despawn?: number;
};

const lerp = (curr: number, target: number, delta: number): number => {
  return curr > target
    ? Math.max(target, curr - delta)
    : Math.min(target, curr + delta);
};

const createAnimatedSprite = (
  animation: Texture[],
  ticker: Ticker
): Sprite3D => {
  const sprite = new Sprite3D(animation, { fps: ticker?.maxFPS });
  sprite.play();
  return sprite;
};

const getAnimationProgress = (
  beat: number,
  speed: number,
  offset: number
): number => {
  const value = beat * speed + offset;
  const progress = value - Math.floor(value);
  return progress;
};

const getXOffset = (columnCount: number): number => {
  return -columnCount / 2 + 0.5;
};

const getZFactor = (zSpacing: number): number => {
  return -zSpacing;
};

const getTrackScaleZ = (scale: number): number => {
  const bottomTrackHeight = 4.25;
  const trackScaleZ = bottomTrackHeight * scale;
  return trackScaleZ;
};

const getTargetStartZ = (scale: number): number => {
  return getTrackScaleZ(scale) * 2 - 0.5;
};

const resizeBottomTrack = (
  bottomTrackContainer: Container3D,
  meshes: Mesh3D[],
  sprites: Sprite3D[],
  followAngle: number,
  screenWidth: number,
  screenHeight: number
): void => {
  const minTilt = 0;
  const maxTilt = 55;
  const tilt = screenWidth < screenHeight ? minTilt : maxTilt;
  const xAngle = 90 - followAngle - tilt;
  bottomTrackContainer.rotationQuaternion.setEulerAngles(xAngle, 0, 0);
  meshes.forEach((mesh) => {
    mesh.scale.z = getTrackScaleZ(0.5);
    mesh.position.z = getTrackScaleZ(0.5);
  });
  sprites.forEach((sprite) => {
    sprite.scale.y = getTrackScaleZ(1);
    sprite.position.z = getTrackScaleZ(1) / 2;
  });
};

const getAnimationName = (type: string): string => {
  if (type === "@") {
    return `_m1a_bunny`;
  }
  if (type === "#") {
    return `_m1a_column`;
  }
  if (type === "P") {
    return `_m1a_pizzarat`;
  }
  if (type === "F") {
    return `_m1a_flyerguy`;
  }
  return "";
};

const getMiddleLane = (tileColumnCount: number): number => {
  return (tileColumnCount - 1) / 2;
};

const getMiddleColor = (): number => {
  return 0xffe133;
};

const getLeftColor = (): number => {
  return 0xff3399;
};

const getRightColor = (): number => {
  return 0x33bbff;
};

const getGuideColor = (): number => {
  return 0x222122;
};

const getLaneColor = (x: number, tileColumnCount: number): number => {
  const middle = getMiddleLane(tileColumnCount);
  return x === middle
    ? getMiddleColor()
    : x < middle
    ? getLeftColor()
    : getRightColor();
};

const getBackgroundColor = (): number => {
  return 0xc81111;
};

const createCeilingMesh = (
  length: number,
  tileColumnCount: number,
  color: number
): Mesh3D => {
  const mesh = Mesh3D.createCube();
  (mesh.material as StandardMaterial).baseColor = Color.fromHex(color);
  (mesh.material as StandardMaterial).unlit = true;
  mesh.scale.x = tileColumnCount * 2 - 2;
  mesh.scale.y = 0;
  mesh.scale.z = length;
  mesh.position.y = 3;
  return mesh;
};

const createFloorMesh = (
  length: number,
  tileColumnCount: number,
  color: number
): Mesh3D => {
  const mesh = Mesh3D.createCube();
  (mesh.material as StandardMaterial).baseColor = Color.fromHex(color);
  (mesh.material as StandardMaterial).unlit = true;
  mesh.scale.x = tileColumnCount * 2 - 2;
  mesh.scale.y = 0;
  mesh.scale.z = length;
  return mesh;
};

const createSafetyLinesMesh = (
  length: number,
  tileColumnCount: number,
  color: number
): Container3D => {
  const scaleX = 1 / 8;
  const offsetX = tileColumnCount;
  const container = new Container3D();
  const leftMesh = Mesh3D.createCube();
  (leftMesh.material as StandardMaterial).baseColor = Color.fromHex(color);
  (leftMesh.material as StandardMaterial).unlit = true;
  leftMesh.scale.x = scaleX;
  leftMesh.scale.y = 0;
  leftMesh.scale.z = length;
  leftMesh.position.x = -offsetX;
  container.addChild(leftMesh);
  const rightMesh = Mesh3D.createCube();
  (rightMesh.material as StandardMaterial).baseColor = Color.fromHex(color);
  (rightMesh.material as StandardMaterial).unlit = true;
  rightMesh.scale.x = scaleX;
  rightMesh.scale.y = 0;
  rightMesh.scale.z = length;
  rightMesh.position.x = offsetX;
  container.addChild(rightMesh);
  return container;
};

const createPillarSprite = (animation: Texture[], color: number): Sprite3D => {
  const sprite = new Sprite3D(animation);
  sprite.anchor.set(0.5, 1.0); // Center Bottom
  sprite.tint = color;
  return sprite;
};

const createTrackMesh = (
  maxZ: number,
  tileColumnCount: number,
  tileZSpacing: number,
  color: number,
  layer: number
): Mesh3D => {
  const trackLength = (maxZ + 1) * getZFactor(tileZSpacing) * 2;
  const meshScale = 0.5;
  const trackMeshScaleZ = trackLength * meshScale;
  const mesh = Mesh3D.createCube();
  (mesh.material as StandardMaterial).baseColor = Color.fromHex(color);
  (mesh.material as StandardMaterial).unlit = true;
  mesh.scale.x = (tileColumnCount + 0.5 + 0.1) * meshScale;
  mesh.scale.y = 0;
  mesh.scale.z = trackMeshScaleZ;
  mesh.position.y = 0.001 * layer;
  mesh.position.z = mesh.scale.z;
  mesh.zIndex = -1000 + layer;
  return mesh;
};

const createTrackSprite = (
  maxZ: number,
  tileColumnCount: number,
  tileZSpacing: number,
  color: number,
  layer: number
): Sprite3D => {
  const trackLength = (maxZ + 1) * getZFactor(tileZSpacing) * 2;
  const sprite = new Sprite3D(Texture.WHITE);
  sprite.tint = color;
  const width = tileColumnCount + 0.5 + 0.1;
  sprite.scale.x = width;
  sprite.scale.y = trackLength;
  sprite.scale.z = width;
  sprite.position.y = 0.001 * layer;
  sprite.position.z = sprite.scale.z;
  sprite.zIndex = -1000 + layer;
  sprite.rotationQuaternion.setEulerAngles(-90, 0, 0);
  return sprite;
};

const createGuideLineSprite = (
  i: number,
  tileZSpacing: number,
  maxZ: number,
  color: number,
  layer: number
): Mesh3D => {
  const trackLength = (maxZ + 1) * getZFactor(tileZSpacing) * 2;
  const scale = 0.5;
  const trackMeshScaleZ = trackLength * scale;
  const minX = -1;
  const mesh = Mesh3D.createCube();
  (mesh.material as StandardMaterial).baseColor = Color.fromHex(color);
  (mesh.material as StandardMaterial).unlit = true;
  mesh.scale.x = 1 / 32;
  mesh.scale.y = 0;
  mesh.scale.z = trackMeshScaleZ;
  mesh.position.x = minX + i;
  mesh.position.y = 0.001 * layer;
  mesh.position.z = trackMeshScaleZ;
  mesh.zIndex = -1000 + layer;
  return mesh;
};

const createBottomSprite = (
  texture: Texture,
  x: number,
  z: number,
  color: number,
  layer: number
): Sprite3D => {
  const sprite = new Sprite3D(texture);
  sprite.tint = color;
  sprite.rotationQuaternion.setEulerAngles(-90, 0, 0);
  sprite.position.x = x;
  sprite.position.y = 0.001 * layer;
  sprite.position.z = z;
  sprite.zIndex = -1000 + layer;
  return sprite;
};

const createObstacleContainer = (
  beat: BeatInfo,
  tileColumnCount: number,
  tileZSpacing: number,
  scale: number,
  textures: Record<string, Texture[]>,
  ticker: Ticker
): Container3D => {
  const x = beat.x + getXOffset(tileColumnCount);
  const y = beat.y;
  const z = beat.z * getZFactor(tileZSpacing);
  const animationName = getAnimationName(beat.s);
  const animation = textures[animationName];
  const sprite = createAnimatedSprite(animation, ticker);
  sprite.anchor.set(0.5, 1.0); // Center Bottom
  const middle = getMiddleLane(tileColumnCount);
  sprite.scale.x = beat.x <= middle ? -scale : scale;
  sprite.scale.y = scale;
  sprite.tint = getLaneColor(beat.x, tileColumnCount);
  const container = new Container3D();
  container.pivot.set(0.5, 1.0); // Center Bottom
  container.position.x = x;
  container.position.y = y;
  container.position.z =
    beat.x <= middle ? z + beat.x * 0.01 : z - beat.x * 0.01;
  container.addChild(sprite);
  return container;
};

const getAnimationTextures = async (
  renderer: Renderer,
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

  private _tileZSpacing = 8;

  private _obstacleScale = 2;

  private _playerScale = 2;

  private _playerSquishScaleY = 0.5;

  private _playerSquishScaleXZ = 1.5;

  private _playerOvershoot = 1 / 4;

  private _playerAnimationSpeed = 1 / 2;

  private _playerSquishSpeed = 4;

  private _playerMoveSpeed = 4;

  private _playerReboundSpeed = 2;

  private _spawnTransitionSpeed = 1 / 4;

  private _judgementZOffset = 0.28;

  private _followHeight = -2;

  private _followDistance = 8;

  private _followAngle = 22;

  private _animationOffset = 0;

  private _beats: BeatInfo[] = [];

  private _animations: Record<string, Texture[]> = {};

  private _compositeContainers: (Container3D | CompositeSprite)[] = [];

  private _ceilingMesh: Mesh3D;

  private _floorMesh: Mesh3D;

  private _safetyLinesMesh: Container3D;

  private _topTrackMesh: Mesh3D;

  private _topLaneMeshes: Mesh3D[] = [];

  private _topTrackContainer: Container3D;

  private _bottomTrackContainer: Container3D;

  private _bottomTrackMeshes: Mesh3D[] = [];

  private _bottomTrackSprites: Sprite3D[] = [];

  private _bottomIndicatorContainer: Container3D;

  private _bottomTargetContainer: Container3D;

  private _obstacleContainers: Container3D[] = [];

  private _leftPillarSprites: Sprite3D[] = [];

  private _rightPillarSprites: Sprite3D[] = [];

  private _targetSprites: Sprite3D[] = [];

  private _playerContainer: Sprite3D;

  private _tapGuideCircleTexture: Texture;

  private _tapTargetCircleTexture: Texture;

  private _swipeUpArrowTexture: Texture;

  private _swipeLeftArrowTexture: Texture;

  private _swipeRightArrowTexture: Texture;

  private _spinGuideCircleTexture: Texture;

  private _backgroundLayer = 0;

  private _safetyLinesLayer = 1;

  private _foregroundLayer = 2;

  private _pillarLayer = 3;

  private _entityLayer = 4;

  private _beatsPerMS = 120 * 1000;

  protected _currentBeat = 0;

  protected _destinationX = 0;

  protected _moving = false;

  protected _overshooting = false;

  protected _rebounding = false;

  protected _sliding = false;

  protected _squishing = false;

  constructor(context: SparkContext, app: Application, assets: SparkAssets) {
    super(context, app, assets);
    // Tiles
    const beatmaps = Object.values(
      this.context.game.struct.config.typeMap?.["Beatmap"] || {}
    );
    const beatmap = beatmaps[0];
    const beats = (beatmap?.beats as unknown as BeatInfo[]) || [];
    const rows: BeatInfo[] = [];
    beats.forEach((beat) => {
      const prevMatchingBeat = rows[beat.x];
      if (
        (beat.s === "^" || beat.s === "<" || beat.s === ">") &&
        prevMatchingBeat
      ) {
        beat.spawn = -prevMatchingBeat.hold;
        beat.hold = 0;
        this._beats.push(beat);
        rows[beat.x] = beat;
      } else if (beat.s === "|" && prevMatchingBeat) {
        prevMatchingBeat.hold += 1;
      } else {
        beat.hold = 0;
        this._beats.push(beat);
        rows[beat.x] = beat;
      }
    });
    const bpm = beats[0]?.bpm ?? 120;
    const bps = bpm / 60;
    this._beatsPerMS = bps / 1000;
    // Background
    this.renderer.background.color = 0x000000;
    // Main Camera
    this.dolly.camera.fieldOfView = 60;
    this.dolly.target.x = 0;
    this.dolly.target.y = this._followHeight;
    this.dolly.target.z = 0;
    this.dolly.angles.x = this._followAngle;
    this.dolly.distance = this._followDistance;
  }

  override getRequiredAssets(): Record<string, { src: string; ext: string }> {
    const typeMap = this.context?.game?.struct?.config?.typeMap || {};
    const assets: Record<string, { src: string; ext: string }> = {};
    Object.entries(typeMap["Midi"] || {}).forEach(([id, asset]) => {
      if (id) {
        assets[id] = asset;
      }
    });
    Object.entries(typeMap["Graphic"] || {}).forEach(([id, asset]) => {
      if (id) {
        assets[id] = asset;
      }
    });
    return assets;
  }

  override async load(): Promise<void> {
    // Load Textures
    await Promise.all(
      Object.entries(
        this.assets.cache.get<Record<string, SVGSVGElement>>("svg") || {}
      ).map(async ([key, value]) => {
        if (!this._animations[key]) {
          this._animations[key] = await getAnimationTextures(
            this.renderer,
            value,
            this.ticker?.maxFPS,
            key
          );
        }
      })
    );
    if (!this._tapGuideCircleTexture) {
      this._tapGuideCircleTexture = createCircleTexture(this.renderer, {
        fillColor: 0x000000,
        strokeColor: 0xffffff,
        strokeWidth: 2,
        radius: 16 / 2,
      });
    }
    if (!this._spinGuideCircleTexture) {
      this._spinGuideCircleTexture = createCircleTexture(this.renderer, {
        fillColor: null,
        strokeColor: 0xffffff,
        strokeWidth: 2,
        radius: 128 / 2,
      });
    }
    if (!this._tapTargetCircleTexture) {
      this._tapTargetCircleTexture = createCircleTexture(this.renderer, {
        fillColor: 0xffffff,
        strokeColor: 0x000000,
        strokeWidth: 2,
        radius: 16 / 2,
      });
    }
    if (!this._swipeUpArrowTexture) {
      this._swipeUpArrowTexture = createLineTexture(this.renderer, {
        thickness: 2,
        fillColor: 0xffffff,
        strokeColor: 0x000000,
        strokeWidth: 0.5,
        max: [16, 16],
        points: [
          [5, 8.5],
          [8, 4.5],
          [11, 8.5],
        ],
      });
    }
    if (!this._swipeLeftArrowTexture) {
      this._swipeLeftArrowTexture = createLineTexture(this.renderer, {
        thickness: 2,
        fillColor: 0xffffff,
        strokeColor: 0x000000,
        strokeWidth: 0.5,
        max: [16, 16],
        points: [
          [9, 10],
          [5, 7],
          [9, 4],
        ],
      });
    }
    if (!this._swipeRightArrowTexture) {
      this._swipeRightArrowTexture = createLineTexture(this.renderer, {
        thickness: 2,
        fillColor: 0xffffff,
        strokeColor: 0x000000,
        strokeWidth: 0.5,
        max: [16, 16],
        points: [
          [7, 4],
          [11, 7],
          [7, 10],
        ],
      });
    }
  }

  override init(): void {
    this._currentBeat = 0;
    this._destinationX = 0;
    this._moving = false;
    this._overshooting = false;
    this._rebounding = false;
    this._sliding = false;
    this._squishing = false;

    // TODO: Only execute the below logic on first load
    const maxZ = this._beats[this._beats.length - 1]?.z ?? 0;
    // Highway
    this._compositeContainers = [
      new Container3D(),
      new Container3D(),
      new Container3D(),
      new Container3D(),
      new Container3D(),
      new Container3D(),
      new Container3D(),
    ];
    // Containers
    this._topTrackContainer = new Container3D();
    this._bottomTrackContainer = new Container3D();
    this._bottomIndicatorContainer = new Container3D();
    this._bottomTargetContainer = new Container3D();
    const backgroundLength = this.dolly.camera.far * 2;
    this._ceilingMesh = createCeilingMesh(
      backgroundLength,
      this._tileColumnCount,
      getBackgroundColor()
    );
    this._compositeContainers[this._backgroundLayer].addChild(
      this._ceilingMesh
    );
    this._floorMesh = createFloorMesh(
      backgroundLength,
      this._tileColumnCount,
      getBackgroundColor()
    );
    this._compositeContainers[this._backgroundLayer].addChild(this._floorMesh);
    this._safetyLinesMesh = createSafetyLinesMesh(
      backgroundLength,
      this._tileColumnCount,
      0x000000
    );
    this._compositeContainers[this._safetyLinesLayer].addChild(
      this._safetyLinesMesh
    );
    // Pillars
    const pillarAnimationName = getAnimationName("#");
    const pillarAnimation = this._animations[pillarAnimationName];
    for (let z = 0; z < maxZ; z += 2) {
      const container = new Container3D();
      const offsetX = this._tileColumnCount - 1;
      const posZ = z * getZFactor(this._tileZSpacing);
      const leftPillarSprite = createPillarSprite(
        pillarAnimation,
        getBackgroundColor()
      );
      leftPillarSprite.position.x = -offsetX;
      leftPillarSprite.position.z = posZ;
      leftPillarSprite.scale.x = this._obstacleScale;
      leftPillarSprite.scale.y = this._obstacleScale;
      this._leftPillarSprites[z] = leftPillarSprite;
      const rightPillarSprite = createPillarSprite(
        pillarAnimation,
        getBackgroundColor()
      );
      rightPillarSprite.position.x = offsetX;
      rightPillarSprite.position.z = posZ;
      rightPillarSprite.scale.x = -1 * this._obstacleScale;
      rightPillarSprite.scale.y = this._obstacleScale;
      this._rightPillarSprites[z] = rightPillarSprite;
      container.addChild(leftPillarSprite);
      container.addChild(rightPillarSprite);
      this._compositeContainers[this._pillarLayer].addChild(container);
    }
    // Top Track
    this._topTrackMesh = createTrackMesh(
      maxZ,
      this._tileColumnCount,
      this._tileZSpacing,
      0x000000,
      -10
    );
    this._topTrackContainer.addChild(this._topTrackMesh);
    // Top Lines
    for (let i = 0; i < this._tileColumnCount; i += 1) {
      const laneMesh = createGuideLineSprite(
        i,
        this._tileZSpacing,
        maxZ,
        getGuideColor(),
        -9
      );
      this._topTrackContainer.addChild(laneMesh);
      this._topLaneMeshes[i] = laneMesh;
    }
    // Bottom Track
    const bottomTrackLeftSprite = createTrackSprite(
      maxZ,
      this._tileColumnCount,
      this._tileZSpacing,
      0x000000,
      -8
    );
    const bottomTrackLeftMask = createTrackSprite(
      maxZ,
      this._tileColumnCount,
      this._tileZSpacing,
      0x000000,
      -7
    );
    const bottomTrackRightMask = createTrackSprite(
      maxZ,
      this._tileColumnCount,
      this._tileZSpacing,
      0x000000,
      -6
    );
    this._bottomTrackContainer.addChild(bottomTrackLeftSprite);
    this._bottomTrackContainer.addChild(bottomTrackLeftMask);
    this._bottomTrackContainer.addChild(bottomTrackRightMask);
    this._bottomTrackSprites.push(bottomTrackLeftSprite);
    this._bottomTrackSprites.push(bottomTrackLeftMask);
    this._bottomTrackSprites.push(bottomTrackRightMask);
    // Bottom Lanes
    for (let i = 0; i < this._tileColumnCount; i += 1) {
      const laneMesh = createGuideLineSprite(
        i,
        this._tileZSpacing,
        maxZ,
        getGuideColor(),
        -7
      );
      this._bottomTrackContainer.addChild(laneMesh);
      this._bottomTrackMeshes.push(laneMesh);
    }
    const bottomJudgementContainer = new Container3D();
    // Bottom Judgement Circles
    const leftSpinCircleSprite = createBottomSprite(
      this._spinGuideCircleTexture,
      -2,
      0.5,
      getGuideColor(),
      -6
    );
    leftSpinCircleSprite.mask = bottomTrackLeftMask;
    bottomJudgementContainer.addChild(leftSpinCircleSprite);
    const rightSpinCircleSprite = createBottomSprite(
      this._spinGuideCircleTexture,
      2,
      0.5,
      getGuideColor(),
      -5
    );
    rightSpinCircleSprite.mask = bottomTrackRightMask;
    bottomJudgementContainer.addChild(rightSpinCircleSprite);
    for (let x = 0; x < this._tileColumnCount; x += 1) {
      const guideCircleSprite = createBottomSprite(
        this._tapGuideCircleTexture,
        x - 1,
        this._judgementZOffset,
        getGuideColor(),
        -4
      );
      guideCircleSprite.anchor.set(0.5, 1.0); // Center Bottom
      bottomJudgementContainer.addChild(guideCircleSprite);
    }
    this._bottomIndicatorContainer.addChild(bottomJudgementContainer);
    this._bottomIndicatorContainer.addChild(this._bottomTargetContainer);
    this._bottomIndicatorContainer.position.z = getTargetStartZ(0.5);
    this._bottomTrackContainer.addChild(this._bottomIndicatorContainer);
    resizeBottomTrack(
      this._bottomTrackContainer,
      this._bottomTrackMeshes,
      this._bottomTrackSprites,
      this._followAngle,
      this.renderer?.screen?.width ?? 0,
      this.renderer?.screen?.height ?? 0
    );
    this._compositeContainers[this._foregroundLayer].addChild(
      this._topTrackContainer
    );
    this._compositeContainers[this._foregroundLayer].addChild(
      this._bottomTrackContainer
    );
    this._playerContainer = new Sprite3D(Texture.EMPTY);
    if (this._playerContainer) {
      this._playerContainer.anchor.set(0.5, 1.0); // Center Bottom
      const playerAnimationName = getAnimationName("@");
      const playerAnimation = this._animations[playerAnimationName];
      const playerSprite = new Sprite3D(playerAnimation);
      if (playerSprite) {
        playerSprite.anchor.set(0.5, 1.0); // Center Bottom
        playerSprite.scale.x = this._playerScale;
        playerSprite.scale.y = this._playerScale;
        this._playerContainer.addChild(playerSprite);
      }
      this._compositeContainers[this._entityLayer].addChild(
        this._playerContainer
      );
    }
    this._beats.forEach((beat) => {
      const obstacleContainer = createObstacleContainer(
        beat,
        this._tileColumnCount,
        this._tileZSpacing,
        this._obstacleScale,
        this._animations,
        this.ticker
      );
      this._obstacleContainers.push(obstacleContainer);
      this._compositeContainers[this._entityLayer].addChild(obstacleContainer);
      const x = beat.x - 1;
      const z = -beat.z + this._judgementZOffset;
      const targetSprite =
        beat.s === "^"
          ? createBottomSprite(this._swipeUpArrowTexture, x, z, 0xffffff, 0)
          : beat.s === ">"
          ? createBottomSprite(this._swipeRightArrowTexture, x, z, 0xffffff, 0)
          : beat.s === "<"
          ? createBottomSprite(this._swipeLeftArrowTexture, x, z, 0xffffff, 0)
          : beat.hold > 0
          ? createBottomSprite(
              createPillTexture(this.renderer, {
                fillColor: 0xffffff,
                strokeColor: 0x000000,
                strokeWidth: 2,
                length: beat.hold * 32,
                radius: 16 / 2,
              }),
              x,
              z,
              getLaneColor(beat.x, this._tileColumnCount),
              -1
            )
          : createBottomSprite(
              this._tapTargetCircleTexture,
              x,
              z,
              getLaneColor(beat.x, this._tileColumnCount),
              -1
            );
      targetSprite.anchor.set(0.5, 1.0); // Center Bottom
      this._targetSprites.push(targetSprite);
      this._bottomTargetContainer.addChild(targetSprite);
    });
    this._compositeContainers.forEach((compositeContainer) => {
      if (compositeContainer instanceof CompositeSprite) {
        this.root.addChild(compositeContainer);
      } else {
        const compositeSprite = new CompositeSprite(this.renderer, {
          objectToRender: compositeContainer,
          resolution: 2,
        });
        this.root.addChild(compositeSprite);
      }
    });
    // Spawn animation duration
    const msPerBeat = 1 / this._beatsPerMS;
    const msPerUnit = msPerBeat / this._tileZSpacing;
    const spawnDurationMS = msPerUnit / this._spawnTransitionSpeed;
    const spawnDuration = spawnDurationMS / 1000;

    this._beats.forEach((beat, i) => {
      const obstacleContainer = this._obstacleContainers[i];
      const targetSprite = this._targetSprites[i];
      // Fade in targets as the player approaches them
      const spawnDistance =
        this._tileZSpacing *
          (beat.z + (beat.spawn ?? 0) - getTargetStartZ(0.5)) +
        1.5;
      const spawnDelayMS = spawnDistance * msPerUnit;
      const spawnDelay = spawnDelayMS / 1000;
      const spawnKey = `spawn-obstacle-${i}`;
      if (!this.context.game.tween.get(spawnKey)) {
        this.context.game.tween.add(spawnKey, {
          delay: spawnDelay,
          duration: spawnDuration,
          on: (tween, p) => {
            const clampedP = Math.min(1, p);
            if (obstacleContainer) {
              obstacleContainer.alpha = tween(0, 1, clampedP);
            }
            if (targetSprite) {
              targetSprite.alpha = tween(0, 1, clampedP);
            }
          },
        });
      }
      // Fade out obstacles when the player passes them
      const despawnDuration = spawnDuration / 2;
      const despawnObstacleDistance =
        (beat.z + (beat.despawn ?? 0)) * this._tileZSpacing;
      const despawnObstacleDelayMS = despawnObstacleDistance * msPerUnit;
      const despawnObstacleDelay = despawnObstacleDelayMS / 1000;
      const despawnObstacleKey = `despawn-obstacle-${i}`;
      if (!this.context.game.tween.get(despawnObstacleKey)) {
        this.context.game.tween.add(despawnObstacleKey, {
          delay: despawnObstacleDelay,
          duration: despawnDuration,
          on: (tween, p) => {
            const clampedP = Math.min(1, p);
            if (p >= 0) {
              if (obstacleContainer) {
                obstacleContainer.alpha = tween(1, 0, clampedP);
              }
            }
          },
        });
      }
      const despawnTargetDistance =
        (beat.z + beat.hold + beat.despawn) * this._tileZSpacing;
      const despawnTargetDelayMS = despawnTargetDistance * msPerUnit;
      const despawnTargetDelay = despawnTargetDelayMS / 1000;
      const despawnTargetKey = `despawn-target-${i}`;
      if (!this.context.game.tween.get(despawnTargetKey)) {
        this.context.game.tween.add(despawnTargetKey, {
          delay: despawnTargetDelay,
          duration: despawnDuration,
          on: (tween, p) => {
            const clampedP = Math.min(1, p);
            if (p >= 0) {
              if (targetSprite) {
                targetSprite.alpha = tween(1, 0, clampedP);
              }
            }
          },
        });
      }
    });
    for (let z = 0; z < maxZ; z += 2) {
      const leftPillarSprite = this._leftPillarSprites[z];
      const rightPillarSprite = this._rightPillarSprites[z];
      // Fade out pillars when the player passes them
      const despawnDuration = spawnDuration / 2;
      const despawnDistance = z * this._tileZSpacing;
      const despawnDelayMS = despawnDistance * msPerUnit;
      const despawnDelay = despawnDelayMS / 1000;
      const despawnKey = `despawn-pillar-${z}`;
      if (!this.context.game.tween.get(despawnKey)) {
        this.context.game.tween.add(despawnKey, {
          delay: despawnDelay,
          duration: despawnDuration,
          on: (tween, p) => {
            const clampedP = Math.min(1, p);
            if (p >= 0) {
              if (leftPillarSprite) {
                leftPillarSprite.alpha = tween(1, 0, clampedP);
              }
              if (rightPillarSprite) {
                rightPillarSprite.alpha = tween(1, 0, clampedP);
              }
            }
          },
        });
      }
    }
    // Start Midis
    Object.entries(
      this.assets.cache.get<Record<string, Float32Array>>("mid") || {}
    ).forEach(([key, buffer]) => {
      this.context.game.sound.start(key, buffer);
    });
  }

  override update(deltaMS: number): boolean {
    // Move beat forward
    const deltaBeats = this._beatsPerMS * deltaMS;
    this._currentBeat += deltaBeats;

    // Calculate animation progress
    const animationProgress = getAnimationProgress(
      this._currentBeat,
      this._playerAnimationSpeed,
      this._animationOffset
    );
    const beatZ = -this._currentBeat * this._tileZSpacing;

    // Highway follows beat
    if (this._topTrackContainer) {
      this._topTrackContainer.position.z = beatZ + 2;
    }
    if (this._bottomTrackContainer) {
      this._bottomTrackContainer.position.z = beatZ + 2;
    }
    if (this._bottomTargetContainer) {
      this._bottomTargetContainer.position.z = this._currentBeat;
    }

    // Player follows beat
    if (this._playerContainer) {
      this._playerContainer.position.z = beatZ;
      // Animate Player
      const playerSprite = this._playerContainer.children[0] as Sprite3D;
      playerSprite?.goto?.(animationProgress);
    }

    // Animate Obstacles
    this._obstacleContainers.forEach((container) => {
      if (container) {
        const sprite = container.children[0] as Sprite3D;
        if (sprite) {
          sprite?.goto?.(animationProgress);
        }
      }
    });

    let lastHoldZ = 0;
    let lastHoldBeat: BeatInfo;
    this._obstacleContainers.forEach((container, i) => {
      if (container) {
        const spriteZ = container.position.z;
        if (spriteZ > beatZ) {
          // Obstacle is behind player
          const beat = this._beats[i];
          if (beat && beat.s === "|" && spriteZ < lastHoldZ) {
            lastHoldZ = spriteZ;
            lastHoldBeat = beat;
          }
        }
      }
    });

    this._sliding =
      lastHoldBeat &&
      this._currentBeat >= lastHoldBeat.z - 1 &&
      this._currentBeat < lastHoldBeat.z + lastHoldBeat.hold;

    if (deltaMS > 0) {
      // Only respond to input when game is not paused or rewinding
      if (!this._sliding && !this._overshooting && !this._rebounding) {
        if (this._playerContainer) {
          // Squish Ball
          const squishDelta = this._playerSquishSpeed * deltaBeats;
          const squishedY = this._squishing ? this._playerSquishScaleY : 1;
          const squishedXZ = this._squishing ? this._playerSquishScaleXZ : 1;
          this._playerContainer.scale.x = lerp(
            this._playerContainer.scale.x,
            squishedXZ,
            squishDelta
          );
          this._playerContainer.scale.y = lerp(
            this._playerContainer.scale.y,
            squishedY,
            squishDelta
          );
          this._playerContainer.scale.z = lerp(
            this._playerContainer.scale.z,
            squishedXZ,
            squishDelta
          );
        }
      }

      if (this._rebounding) {
        if (this._playerContainer) {
          // Rebound Ball
          const delta = this._playerReboundSpeed * deltaBeats;
          const ballX = this._destinationX;
          this._playerContainer.position.x = lerp(
            this._playerContainer.position.x,
            ballX,
            delta
          );
          const ballMoveDone = this._playerContainer.position.x === ballX;
          const ballScaleX = 1;
          const ballScaleYZ = 1;
          this._playerContainer.scale.x = lerp(
            this._playerContainer.scale.x,
            ballScaleX,
            delta
          );
          this._playerContainer.scale.y = lerp(
            this._playerContainer.scale.y,
            ballScaleYZ,
            delta
          );
          this._playerContainer.scale.z = lerp(
            this._playerContainer.scale.z,
            ballScaleYZ,
            delta
          );
          const ballScaleDone =
            this._playerContainer.scale.x === ballScaleX &&
            this._playerContainer.scale.y === ballScaleYZ &&
            this._playerContainer.scale.z === ballScaleYZ;
          if (ballMoveDone && ballScaleDone) {
            this._rebounding = false;
          }
        }
      }

      if (this._overshooting) {
        if (this._playerContainer) {
          // Overshoot Ball
          const delta = this._playerMoveSpeed * deltaBeats;
          const ballX =
            this._destinationX < 0
              ? this._destinationX - this._playerOvershoot
              : this._destinationX + this._playerOvershoot;
          this._playerContainer.position.x = lerp(
            this._playerContainer.position.x,
            ballX,
            delta
          );
          const ballMoveDone = this._playerContainer.position.x === ballX;
          const ballScaleX = 0.5;
          const ballScaleYZ = 1.5;
          this._playerContainer.scale.x = lerp(
            this._playerContainer.scale.x,
            ballScaleX,
            delta
          );
          this._playerContainer.scale.y = lerp(
            this._playerContainer.scale.y,
            ballScaleYZ,
            delta
          );
          this._playerContainer.scale.z = lerp(
            this._playerContainer.scale.z,
            ballScaleYZ,
            delta
          );
          const ballScaleDone =
            this._playerContainer.scale.x === ballScaleX &&
            this._playerContainer.scale.y === ballScaleYZ &&
            this._playerContainer.scale.z === ballScaleYZ;
          if (ballMoveDone && ballScaleDone) {
            this._overshooting = false;
            this._rebounding = true;
          }
        }
      }

      if (this._moving) {
        if (this._playerContainer) {
          // Move Ball
          const delta = this._playerMoveSpeed * deltaBeats;
          this._playerContainer.position.x = lerp(
            this._playerContainer.position.x,
            this._destinationX,
            delta
          );
          if (this._playerContainer.position.x === this._destinationX) {
            this._moving = false;
            if (this._destinationX !== 0) {
              // Only overshoot when moving into one of the side lines (not the middle lane)
              this._overshooting = true;
            }
          }
        }
      }
    }

    if (deltaMS) {
      // Camera follows beat
      this.dolly.target.y = this._followHeight;
      this.dolly.target.z = beatZ;
      return true;
    }

    return false;
  }

  override resize(): void {
    if (this._bottomTrackContainer) {
      resizeBottomTrack(
        this._bottomTrackContainer,
        this._bottomTrackMeshes,
        this._bottomTrackSprites,
        this._followAngle,
        this.renderer.screen.width,
        this.renderer.screen.height
      );
    }
  }

  override onPointerDown(_event: PointerEvent): void {
    this._squishing = !this._sliding;
  }

  override onPointerUp(_event: PointerEvent): void {
    this._squishing = false;
  }

  override onDragStart(
    event: PointerEvent,
    dragThreshold: number,
    distanceX: number
  ): void {
    if (
      this._playerContainer &&
      this._playerContainer.position.x === this._destinationX &&
      !this._moving &&
      !this._overshooting &&
      !this._rebounding
    ) {
      const directionX =
        distanceX > dragThreshold / 2
          ? 1
          : distanceX < -dragThreshold / 2
          ? -1
          : 0;
      const destination = this._destinationX + directionX;
      if (destination < -1 || destination > 1) {
        this._moving = false;
        this._overshooting = true;
      } else {
        this._moving = true;
      }
      const clampedDestination = Math.max(-1, Math.min(destination, 1));
      this._destinationX = clampedDestination;
    }
  }
}
