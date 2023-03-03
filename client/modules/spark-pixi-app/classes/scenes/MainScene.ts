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
import { generateGrid } from "../../plugins/graphics";
import {
  Color,
  Container3D,
  Mesh3D,
  Quaternion,
  Sprite3D,
  StandardMaterial,
} from "../../plugins/projection";
import { Ticker } from "../../plugins/ticker";
import { SparkScene } from "../SparkScene";

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

const getXOffset = (columnCount: number): number => {
  return -columnCount / 2 + 0.5;
};

const getYOffset = (_type: string): number => {
  return 0.00025;
};

const getZFactor = (zSpacing: number): number => {
  return -zSpacing;
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
  if (type === "|") {
    return `_m_hold`;
  }
  if (type === "\\") {
    return `_m_swipe`;
  }
  if (type === "/") {
    return `_m_swipe`;
  }
  if (type === "<") {
    return `_m_swipe`;
  }
  if (type === ">") {
    return `_m_swipe`;
  }
  if (type === "^") {
    return `_m_swipe`;
  }
  if (type === "v") {
    return `_m_swipe`;
  }
  return "";
};

const getSwipeTargetXOffset = (beat: Beat): number => {
  switch (beat.s) {
    case ">":
      return 1;
    case "/":
      return 1;
    case "<":
      return -1;
    case "\\":
      return -1;
    default:
      return 0;
  }
};

const getFloorColor = (): number => {
  return 0x80c2bc;
};

const getGridColor = (): number => {
  return 0x000000;
};

const getTrackColor = (): number => {
  return 0x000000;
};

const getBallColor = (): number => {
  return 0xd90000;
};

const createTargetTapContainer = (
  beat: Beat,
  tileColumnCount: number,
  tileZSpacing: number,
  scale: number,
  textures: Record<string, Texture[]>
): Container3D => {
  const x = beat.x + getXOffset(tileColumnCount);
  const y = beat.y + getYOffset(beat.s);
  const z = beat.z * getZFactor(tileZSpacing);
  const animationName = getAnimationName(beat.s);
  const animation = textures[animationName];
  const sprite = new Sprite3D(animation);
  sprite.rotationQuaternion.setEulerAngles(90, 0, 0);
  sprite.scale.x = scale;
  sprite.scale.y = scale;
  const container = new Container3D();
  container.position.x = x;
  container.position.y = y + 0.001;
  container.position.z = z;
  container.zIndex = 1;
  container.addChild(sprite);
  return container;
};

const createTargetHoldContainer = (
  beat: Beat,
  tileColumnCount: number,
  tileZSpacing: number,
  scale: number,
  textures: Record<string, Texture[]>
): Container3D => {
  const x = beat.x + getXOffset(tileColumnCount);
  const y = beat.y + getYOffset(beat.s);
  const z = beat.z * getZFactor(tileZSpacing);
  const holdAnimationName = getAnimationName(beat.s);
  const holdAnimation = textures[holdAnimationName];
  const circleAnimationName = getAnimationName("*");
  const circleAnimation = textures[circleAnimationName];
  const endCircleSprite = new Sprite3D(circleAnimation);
  endCircleSprite.anchor.set(0.5, 1.0);
  endCircleSprite.rotationQuaternion.setEulerAngles(90, 0, 0);
  endCircleSprite.scale.x = scale;
  endCircleSprite.scale.y = scale;
  endCircleSprite.position.y = 0.004;
  endCircleSprite.position.z = -tileZSpacing - 0.5;
  endCircleSprite.zIndex = -902;
  const holdSprite = new Sprite3D(holdAnimation);
  holdSprite.anchor.set(0.5, 1.0);
  holdSprite.rotationQuaternion.setEulerAngles(90, 0, 0);
  holdSprite.scale.x = scale;
  holdSprite.scale.y = tileZSpacing + 0.5;
  holdSprite.position.y = 0.002;
  holdSprite.position.z = -tileZSpacing;
  holdSprite.zIndex = -904;
  const startCircleSprite = new Sprite3D(circleAnimation);
  startCircleSprite.anchor.set(0.5, 1.0);
  startCircleSprite.rotationQuaternion.setEulerAngles(90, 0, 0);
  startCircleSprite.scale.x = scale;
  startCircleSprite.scale.y = scale;
  startCircleSprite.position.y = 0.003;
  startCircleSprite.position.z = -0.5;
  startCircleSprite.zIndex = -903;
  const container = new Container3D();
  container.pivot.set(0.5, 1.0);
  container.position.x = x;
  container.position.y = y;
  container.position.z = z;
  container.addChild(holdSprite);
  container.addChild(startCircleSprite);
  container.addChild(endCircleSprite);
  return container;
};

const createTargetSwipeContainer = (
  beat: Beat,
  tileColumnCount: number,
  tileZSpacing: number,
  scale: number,
  textures: Record<string, Texture[]>
): Container3D => {
  const x = beat.x + getXOffset(tileColumnCount);
  const y = beat.y + getYOffset(beat.s);
  const z = beat.z * getZFactor(tileZSpacing);
  const endXOffset = getSwipeTargetXOffset(beat);
  const swipeAnimationName = getAnimationName(beat.s);
  const swipeAnimation = textures[swipeAnimationName];
  const circleAnimationName = getAnimationName("*");
  const circleAnimation = textures[circleAnimationName];
  const endCircleSprite = new Sprite3D(circleAnimation);
  endCircleSprite.rotationQuaternion.setEulerAngles(90, 0, 0);
  endCircleSprite.scale.x = scale;
  endCircleSprite.scale.y = scale;
  endCircleSprite.position.x = endXOffset;
  endCircleSprite.position.y = 0.004;
  endCircleSprite.position.z = 0;
  endCircleSprite.zIndex = -902;
  const swipeSprite = new Sprite3D(swipeAnimation);
  swipeSprite.rotationQuaternion.setEulerAngles(90, 0, 0);
  swipeSprite.scale.x = 1;
  swipeSprite.scale.y = scale;
  swipeSprite.position.y = 0.003;
  swipeSprite.position.x = endXOffset > 0 ? 0.5 : -0.5;
  swipeSprite.position.z = 0;
  swipeSprite.zIndex = -903;
  const startCircleSprite = new Sprite3D(circleAnimation);
  startCircleSprite.rotationQuaternion.setEulerAngles(90, 0, 0);
  startCircleSprite.scale.x = scale;
  startCircleSprite.scale.y = scale;
  startCircleSprite.position.x = 0;
  startCircleSprite.position.y = 0.002;
  startCircleSprite.position.z = 0;
  startCircleSprite.zIndex = -904;
  const container = new Container3D();
  container.position.x = x;
  container.position.y = y;
  container.position.z = z;
  container.addChild(swipeSprite);
  container.addChild(startCircleSprite);
  container.addChild(endCircleSprite);
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

  private _tileZSpacing = 8;

  private _tilePixelSize = 32;

  private _obstacleSpriteZOffset = 0.1;

  private _obstacleScale = 2;

  private _targetSpriteScale = 1;

  private _ballScale = 0.25;

  private _gridThickness = 1;

  private _cameraOvershoot = 0.125;

  private _ballOvershoot = 0.25;

  private _animationSpeed = 0.5;

  private _squishSpeed = 4;

  private _spawnDistance = 4;

  private _spawnTransitionEase = EASE.backOut;

  private _spawnTransitionSpeed = 0.125;

  private _ballMoveSpeed = 4;

  private _ballReboundSpeed = 2;

  private _cameraMoveSpeed = 4;

  private _cameraReboundSpeed = 1;

  private _cameraTransitionEase = EASE.expoInOut;

  private _cameraTransitionDelay = 0.5;

  private _cameraTransitionDuration = 2;

  private _startHeight = 3;

  private _startDistance = 6;

  private _startAngle = 30;

  private _followHeight = 2;

  private _followDistance = 5;

  private _followAngle = 15;

  private _despawnDistance = 64;

  private _animationOffset = 0;

  private _obstacleBeats: Beat[] = [];

  private _targetBeats: Beat[] = [];

  private _animations: Record<string, Texture[]> = {};

  private _floorSprite: Sprite3D;

  private _trackSprite: Sprite3D;

  private _gridSprites: Sprite3D[] = [];

  private _targetContainers: Container3D[] = [];

  private _obstacleSprites: Sprite3D[] = [];

  private _playerContainer: Sprite3D;

  private _ball: Container3D;

  private _ballMesh: Mesh3D;

  private _ballMaterial = StandardMaterial.create(undefined);

  private _floorRotation = Quaternion.fromEuler(90, 0, 0).array;

  private _upNext: { beat: Beat }[][] = [];

  private _beatsPerMS = 120 * 1000;

  private _currentBeat = 0;

  private _destinationX = 0;

  private _moving = false;

  private _overshooting = false;

  private _rebounding = false;

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
    const gridHeight = this._tileZSpacing;
    const trackLength = maxZ * getZFactor(this._tileZSpacing);
    // Floor
    this._floorSprite = new Sprite3D(Texture.WHITE);
    this._floorSprite.anchor.set(0.5, 1.0); // Center Bottom
    this._floorSprite.scale.x = this.dolly.camera.far;
    this._floorSprite.scale.y = trackLength * 2;
    this._floorSprite.position.y = -0.01;
    this._floorSprite.position.z = -trackLength;
    this._floorSprite.zIndex = -1002;
    this._floorSprite.rotationQuaternion.array = this._floorRotation;
    this._floorSprite.tint = getFloorColor();
    // Track
    this._trackSprite = new Sprite3D(Texture.WHITE);
    this._trackSprite.anchor.set(0.5, 1.0); // Center Bottom
    this._trackSprite.scale.x = this._tileColumnCount;
    this._trackSprite.scale.y = trackLength;
    this._trackSprite.position.y = -0.001;
    this._trackSprite.position.z = this._tileZSpacing;
    this._trackSprite.zIndex = -1001;
    this._trackSprite.rotationQuaternion.array = this._floorRotation;
    this._trackSprite.tint = getTrackColor();
    // Grid
    const gridTexture = generateGrid(
      this.renderer,
      this._gridThickness,
      this._tilePixelSize,
      this._tileColumnCount,
      this._tileZSpacing,
      true,
      false
    );
    const numTracks = Math.ceil(Math.abs(trackLength / gridHeight));
    for (let i = 0; i < numTracks; i += 1) {
      const z = i * -gridHeight + 0.5;
      const grid = new Sprite3D(gridTexture);
      grid.width = this._tileColumnCount;
      grid.height = gridHeight;
      grid.zIndex = -1000;
      grid.rotationQuaternion.array = this._floorRotation;
      grid.anchor.set(0.5, 1.0); // Center Bottom
      grid.position.x = 0;
      grid.position.y = 0;
      grid.position.z = z;
      grid.tint = getGridColor();
      this._gridSprites.push(grid);
    }
    // Camera
    this.dolly.camera.fieldOfView = 60;
    this.dolly.target.x = 0;
    this.dolly.target.y = this._startHeight;
    this.dolly.target.z = 0;
    this.dolly.angles.x = this._startAngle;
    this.dolly.distance = this._startDistance;
    // Material
    this._ballMaterial.baseColor = Color.fromHex(getBallColor());
    this._ballMaterial.unlit = true;
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
    if (this._floorSprite) {
      this.stage.addChild(this._floorSprite);
    }
    if (this._trackSprite) {
      this.stage.addChild(this._trackSprite);
    }
    this._gridSprites.forEach((sprite) => {
      this.stage.addChild(sprite);
    });
    const animationName = getAnimationName("P");
    const playerAnimation = this._animations[animationName];
    if (playerAnimation) {
      this._playerContainer = new Sprite3D(Texture.EMPTY);
      this._playerContainer.anchor.set(0.5, 1.0); // Center Bottom
      this._ball = new Container3D();
      this._ball.pivot.set(0.5, 1.0); // Center Bottom
      this._ballMesh = Mesh3D.createSphere(this._ballMaterial);
      this._ballMesh.pivot.set(0.5, 1.0); // Center Bottom
      this._ballMesh.scale.x = this._ballScale;
      this._ballMesh.scale.y = this._ballScale;
      this._ballMesh.scale.z = this._ballScale;
      this._ballMesh.position.y = this._ballMesh.scale.y;
      this._ball.addChild(this._ballMesh);
      this._playerContainer.addChild(this._ball);
      this.stage.addChild(this._playerContainer);
    }
    this._targetBeats.forEach((beat) => {
      const targetContainer =
        beat.s === "*"
          ? createTargetTapContainer(
              beat,
              this._tileColumnCount,
              this._tileZSpacing,
              this._targetSpriteScale,
              this._animations
            )
          : beat.s === "|"
          ? createTargetHoldContainer(
              beat,
              this._tileColumnCount,
              this._tileZSpacing,
              this._targetSpriteScale,
              this._animations
            )
          : createTargetSwipeContainer(
              beat,
              this._tileColumnCount,
              this._tileZSpacing,
              this._targetSpriteScale,
              this._animations
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
      obstacleSprite.tint = getFloorColor();
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
          this.dolly.angles.x = tween(this._startAngle, this._followAngle);
          this.dolly.distance = tween(
            this._startDistance,
            this._followDistance
          );
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
          this.context.game.tween.add(key, {
            delay: spawnDelay,
            duration: spawnDuration,
            ease: this._spawnTransitionEase,
            on: (tween, p) => {
              container.renderable = p >= 0;
              if (container) {
                container.alpha = tween(0, 1);
                container.scale.x = tween(0, 1);
                container.scale.y = tween(0, 1);
              }
            },
          });
        }
      }
    });
  }

  override update(deltaMS: number): boolean {
    // Move beat forward
    const deltaBeats = this._beatsPerMS * deltaMS;
    this._currentBeat += deltaBeats;

    // Calculate animation progress
    const beatZ = -this._currentBeat * this._tileZSpacing;
    const animationProgress = getAnimationProgress(
      this._currentBeat,
      this._animationSpeed,
      this._animationOffset
    );

    // Player follows beat
    if (this._playerContainer) {
      this._playerContainer.position.z = beatZ;
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
        const children = container.children;
        const beat = this._targetBeats[i];
        const spriteZ = container.position.z;
        if (spriteZ > beatZ) {
          children.forEach((child) => {
            // Sprite is behind player
            if (spriteZ > beatZ + this._despawnDistance) {
              // Sprite is now off camera
              child.renderable = false;
            } else {
              // Sprite is still on camera
              child.renderable = true;
            }
            if (child instanceof Sprite3D) {
              // child.tint = getInactiveColor();
            }
          });
        } else {
          // Sprite is in front of player
          children.forEach((child) => {
            child.renderable = true;
            if (child instanceof Sprite3D) {
              // child.tint = getSpriteActiveColor(beat);
            }
          });
          if (!nextTapTargetZ && spriteZ < nextTapTargetZ) {
            nextTapTargetZ = spriteZ;
          }
          if (spriteZ === nextTapTargetZ) {
            if (!this._upNext[beat.x]) {
              this._upNext[beat.x] = [];
            }
            if (!this._upNext[beat.x][beat.y]) {
              this._upNext[beat.x][beat.y] = { beat };
            }
          }
        }
      }
    });

    const squishing = this.isPointerDown();

    if (
      !squishing &&
      !this._moving &&
      !this._overshooting &&
      !this._rebounding
    ) {
      if (this._ball) {
        // Bounce Ball
        const ang = Math.sin(animationProgress * Math.PI);
        const posY = Math.abs(ang);
        this._ball.position.y = posY;
      }
    }

    if (deltaMS > 0) {
      // Only respond to input when game is not paused or rewinding
      if (!this._overshooting && !this._rebounding) {
        if (this._ball) {
          // Squish Ball
          const squishDelta = this._squishSpeed * deltaBeats;
          const squishedY = squishing ? 0.5 : 1;
          const squishedXZ = squishing ? 1.5 : 1;
          this._ball.scale.x = lerp(
            this._ball.scale.x,
            squishedXZ,
            squishDelta
          );
          this._ball.scale.y = lerp(this._ball.scale.y, squishedY, squishDelta);
          this._ball.scale.z = lerp(
            this._ball.scale.z,
            squishedXZ,
            squishDelta
          );
        }
      }

      if (this._rebounding) {
        if (this._ball) {
          // Rebound Ball
          const delta = this._ballReboundSpeed * deltaBeats;
          const ballX = this._destinationX;
          this._ball.position.x = lerp(this._ball.position.x, ballX, delta);
          const ballMoveDone = this._ball.position.x === ballX;
          const ballScaleX = 1;
          const ballScaleYZ = 1;
          this._ball.scale.x = lerp(this._ball.scale.x, ballScaleX, delta);
          this._ball.scale.y = lerp(this._ball.scale.y, ballScaleYZ, delta);
          this._ball.scale.z = lerp(this._ball.scale.z, ballScaleYZ, delta);
          const ballScaleDone =
            this._ball.scale.x === ballScaleX &&
            this._ball.scale.y === ballScaleYZ &&
            this._ball.scale.z === ballScaleYZ;
          if (ballMoveDone && ballScaleDone) {
            this._rebounding = false;
          }
        }
        if (this.dolly) {
          // Rebound Camera
          const delta = this._cameraReboundSpeed * deltaBeats;
          const cameraX = 0;
          this.dolly.target.x = lerp(this.dolly.target.x, cameraX, delta);
        }
      }

      if (this._overshooting) {
        if (this._ball) {
          // Overshoot Ball
          const delta = this._ballMoveSpeed * deltaBeats;
          const ballX =
            this._destinationX < 0
              ? this._destinationX - this._ballOvershoot
              : this._destinationX + this._ballOvershoot;
          this._ball.position.x = lerp(this._ball.position.x, ballX, delta);
          const ballMoveDone = this._ball.position.x === ballX;
          const ballScaleX = 0.5;
          const ballScaleYZ = 1.5;
          this._ball.scale.x = lerp(this._ball.scale.x, ballScaleX, delta);
          this._ball.scale.y = lerp(this._ball.scale.y, ballScaleYZ, delta);
          this._ball.scale.z = lerp(this._ball.scale.z, ballScaleYZ, delta);
          const ballScaleDone =
            this._ball.scale.x === ballScaleX &&
            this._ball.scale.y === ballScaleYZ &&
            this._ball.scale.z === ballScaleYZ;
          if (ballMoveDone && ballScaleDone) {
            this._overshooting = false;
            this._rebounding = true;
          }
        }
        if (this.dolly) {
          // Overshoot Camera
          const delta = this._cameraMoveSpeed * deltaBeats;
          const cameraX =
            this._destinationX < 0
              ? -this._cameraOvershoot
              : this._cameraOvershoot;
          this.dolly.target.x = lerp(this.dolly.target.x, cameraX, delta);
        }
      }

      if (this._moving) {
        if (this._ball) {
          // Move Ball
          const delta = this._ballMoveSpeed * deltaBeats;
          this._ball.position.x = lerp(
            this._ball.position.x,
            this._destinationX,
            delta
          );
          if (this._ball.position.x === this._destinationX) {
            this._moving = false;
            if (this._destinationX !== 0) {
              // Only overshoot when moving into one of the side lines (not the middle lane)
              this._overshooting = true;
            }
          }
        }
      }
    }

    if (this.context.game.tween.state.elapsedMS > this._cameraTransitionDelay) {
      // Camera follows beat
      this.dolly.target.y = this._followHeight;
      this.dolly.target.z = beatZ;
      return true;
    }

    return false;
  }

  override onDragStart(
    event: PointerEvent,
    dragThreshold: number,
    distanceX: number
  ): void {
    if (
      this._ball.position.x === this._destinationX &&
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
