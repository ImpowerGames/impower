import Phaser from "phaser";
import {
  CenterType,
  GameProjectData,
  ScaleModeType,
  SparkContext,
  SparkGame,
  SparkGameRunner,
} from "../../../../../spark-engine";
import { Color, getColorRgbString, hexToHsla } from "../../../impower-core";
import { ASSET_SCENE_KEY, PhaserAssetScene } from "./scenes/phaserAssetScene";
import { LOGIC_SCENE_KEY, PhaserLogicScene } from "./scenes/phaserLogicScene";
import { MAIN_SCENE_KEY, PhaserMainScene } from "./scenes/phaserMainScene";
import {
  PhaserPreloadingScene,
  PRELOADING_SCENE_KEY,
} from "./scenes/phaserPreloadingScene";
import {
  PhaserSplashScene,
  SPLASH_SCENE_KEY,
} from "./scenes/phaserSplashScene";

export class PhaserGame extends Phaser.Game {
  private _project: GameProjectData;

  public get project(): GameProjectData {
    return this._project;
  }

  private _projectId: string;

  public get projectId(): string {
    return this._projectId;
  }

  private _sparkContext: SparkContext | undefined;

  public get sparkContext(): SparkContext | undefined {
    return this._sparkContext;
  }

  private _mainScene: PhaserMainScene;

  public get mainScene(): PhaserMainScene {
    return this._mainScene;
  }

  private _splashScene: PhaserSplashScene;

  public get splashScene(): PhaserSplashScene {
    return this._splashScene;
  }

  private _blockScene: PhaserLogicScene | undefined;

  public get blockScene(): PhaserLogicScene | undefined {
    return this._blockScene;
  }

  private _assetScene: PhaserAssetScene | undefined;

  public get assetScene(): PhaserAssetScene | undefined {
    return this._assetScene;
  }

  private _preloadingScene: PhaserPreloadingScene | undefined;

  public get preloadingScene(): PhaserPreloadingScene | undefined {
    return this._preloadingScene;
  }

  private _storageFileUrls: { [refId: string]: string };

  public get storageFileUrls(): { [refId: string]: string } {
    return this._storageFileUrls;
  }

  static getPhaserScaleModeType(mode: ScaleModeType): number {
    switch (mode) {
      case "Envelop":
        return Phaser.Scale.ENVELOP;
      case "Fit":
        return Phaser.Scale.FIT;
      case "HeightControlsWidth":
        return Phaser.Scale.HEIGHT_CONTROLS_WIDTH;
      case "WidthControlsHeight":
        return Phaser.Scale.WIDTH_CONTROLS_HEIGHT;
      default:
        return Phaser.Scale.NONE;
    }
  }

  static getPhaserCenterType(autoCenter: CenterType): number {
    switch (autoCenter) {
      case "CenterBoth":
        return Phaser.Scale.CENTER_BOTH;
      case "CenterHorizontally":
        return Phaser.Scale.CENTER_HORIZONTALLY;
      case "CenterVertically":
        return Phaser.Scale.CENTER_VERTICALLY;
      default:
        return Phaser.Scale.NO_CENTER;
    }
  }

  static getScaleConfig(
    project: GameProjectData
  ): Phaser.Types.Core.ScaleConfig {
    const mode = PhaserGame.getPhaserScaleModeType(
      project?.instances?.configs?.data?.ScaleConfig?.mode
    );
    const autoCenter = PhaserGame.getPhaserCenterType(
      project?.instances?.configs?.data?.ScaleConfig?.autoCenter
    );
    return {
      ...(project?.instances?.configs?.data?.ScaleConfig || {}),
      parent: "game",
      mode,
      autoCenter,
    };
  }

  static getBackgroundColor(project: GameProjectData): string {
    const gameColor: Color =
      project?.instances?.configs?.data?.BackgroundConfig?.game;
    if (gameColor) {
      return getColorRgbString(gameColor);
    }
    return getColorRgbString(hexToHsla("#000000"));
  }

  constructor(
    project: GameProjectData,
    projectId: string,
    sparkGame?: SparkGame,
    sparkRunner?: SparkGameRunner,
    control?: "Play" | "Pause",
    logoUrl?: string
  ) {
    const active = sparkGame !== undefined;
    const mainScene = new PhaserMainScene({
      key: MAIN_SCENE_KEY,
      active,
      visible: true,
    });
    const splashScene = new PhaserSplashScene(
      {
        key: SPLASH_SCENE_KEY,
        active: false,
        visible: true,
      },
      logoUrl
    );
    const context = new SparkContext(sparkGame, sparkRunner);
    Object.values(sparkRunner.commandRunners || {}).forEach((r) => {
      r.init();
    });

    const preloadingScene = new PhaserPreloadingScene(
      {
        key: PRELOADING_SCENE_KEY,
        active,
        visible: true,
      },
      context
    );

    const assetScene = new PhaserAssetScene(
      {
        key: ASSET_SCENE_KEY,
        active: false,
        visible: true,
      },
      projectId,
      context,
      preloadingScene.EarlyImageFileRequests,
      preloadingScene.EarlyMoveImageFileRequests,
      preloadingScene.EarlyRotateImageFileRequests,
      preloadingScene.EarlyScaleImageFileRequests,
      preloadingScene.EarlyAudioFileRequests
    );
    const blockScene = sparkGame
      ? new PhaserLogicScene(
          {
            key: LOGIC_SCENE_KEY,
            active,
            visible: false,
          },
          context
        )
      : undefined;

    const initialScenes: Phaser.Scene[] = [
      mainScene,
      splashScene,
      assetScene,
      preloadingScene,
    ];
    if (blockScene) {
      initialScenes.push(blockScene);
    }

    const gameConfig = {
      parent: "game",
      scale: PhaserGame.getScaleConfig(project),
      transparent: true,
      scene: initialScenes,
    } as Phaser.Types.Core.GameConfig;
    super(gameConfig);

    this._mainScene = mainScene;
    this._splashScene = splashScene;
    this._preloadingScene = preloadingScene;
    this._blockScene = blockScene;
    this._assetScene = assetScene;
    this.canvas.id = "game-canvas";
    this._project = project;
    this._sparkContext = context;
    if (this.sparkContext) {
      this.sparkContext.init();
    }
    const onStart = async (): Promise<void> => {
      if (this.sparkContext) {
        await this.sparkContext.start();
      }
      if (control) {
        this.controlScenes(control);
      }
    };
    this.events.on("start", onStart);
  }

  destroy(removeCanvas: boolean, noReturn?: boolean): void {
    if (this.sparkContext) {
      this.sparkContext.end();
    }
    super.destroy(removeCanvas, noReturn);
  }

  getScreenStyle(): { backgroundColor: string } {
    const { project } = this;

    const color: Color =
      project?.instances?.configs?.data?.BackgroundConfig?.screen;
    if (color) {
      return {
        backgroundColor: getColorRgbString(color),
      };
    }
    return {
      backgroundColor: getColorRgbString(hexToHsla("#000000")),
    };
  }

  getGameStyle(): { backgroundColor: string } {
    const { project } = this;
    const color: Color =
      project?.instances?.configs?.data?.BackgroundConfig?.game;
    if (color) {
      return {
        backgroundColor: getColorRgbString(color),
      };
    }
    return {
      backgroundColor: getColorRgbString(hexToHsla("#000000")),
    };
  }

  getUIStyle(): { backgroundColor: string } {
    const { project } = this;
    const color: Color =
      project?.instances?.configs?.data?.BackgroundConfig?.ui;
    if (color) {
      return {
        backgroundColor: getColorRgbString(color),
      };
    }
    return {
      backgroundColor: getColorRgbString(hexToHsla("#000000")),
    };
  }

  updateProject(project: GameProjectData): void {
    this._project = project;
  }

  controlScenes(control: "Play" | "Pause"): void {
    const scenes = this.scene.getScenes(false);
    scenes.forEach((scene) => {
      switch (control) {
        case "Play": {
          if (scene.scene.isPaused()) {
            scene.scene.resume();
          }
          break;
        }
        case "Pause": {
          if (!scene.scene.isPaused()) {
            scene.scene.pause();
          }
          break;
        }
        default:
          break;
      }
    });
  }
}
