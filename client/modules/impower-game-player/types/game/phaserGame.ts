import Phaser from "phaser";
import { Color, getColorRgbString, hexToHsla } from "../../../impower-core";
import {
  CenterType,
  GameProjectData,
  ScaleModeType,
} from "../../../impower-game/data";
import { ImpowerGame } from "../../../impower-game/game";
import { ImpowerDataMap } from "../../../impower-game/project";
import {
  getRuntimeValue,
  ImpowerGameRunner,
} from "../../../impower-game/runner";
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

  private _impowerGame: ImpowerGame | undefined;

  public get impowerGame(): ImpowerGame | undefined {
    return this._impowerGame;
  }

  private _impowerDataMap: ImpowerDataMap | undefined;

  public get impowerDataMap(): ImpowerDataMap | undefined {
    return this._impowerDataMap;
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
      case ScaleModeType.Envelop:
        return Phaser.Scale.ENVELOP;
      case ScaleModeType.Fit:
        return Phaser.Scale.FIT;
      case ScaleModeType.HeightControlsWidth:
        return Phaser.Scale.HEIGHT_CONTROLS_WIDTH;
      case ScaleModeType.WidthControlsHeight:
        return Phaser.Scale.WIDTH_CONTROLS_HEIGHT;
      default:
        return Phaser.Scale.NONE;
    }
  }

  static getPhaserCenterType(autoCenter: CenterType): number {
    switch (autoCenter) {
      case CenterType.CenterBoth:
        return Phaser.Scale.CENTER_BOTH;
      case CenterType.CenterHorizontally:
        return Phaser.Scale.CENTER_HORIZONTALLY;
      case CenterType.CenterVertically:
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

  static getBackgroundColor(
    project: GameProjectData,
    impowerProject: ImpowerDataMap,
    game: ImpowerGame
  ): string {
    const gameColor: Color = getRuntimeValue(
      project?.instances?.configs?.data?.BackgroundConfig?.game,
      impowerProject?.variables,
      game
    );
    if (gameColor) {
      return getColorRgbString(gameColor);
    }
    return getColorRgbString(hexToHsla("#000000"));
  }

  constructor(
    project: GameProjectData,
    projectId: string,
    impowerGame?: ImpowerGame,
    impowerRunner?: ImpowerGameRunner,
    control?: "Play" | "Pause",
    logoUrl?: string
  ) {
    const active = impowerGame !== undefined;
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
    const impowerDataMap = impowerRunner
      ? new ImpowerDataMap(project, impowerRunner)
      : undefined;

    const preloadingScene = new PhaserPreloadingScene(
      {
        key: PRELOADING_SCENE_KEY,
        active,
        visible: true,
      },
      impowerGame,
      impowerDataMap
    );

    const assetScene = new PhaserAssetScene(
      {
        key: ASSET_SCENE_KEY,
        active: false,
        visible: true,
      },
      projectId,
      impowerGame,
      impowerDataMap,
      preloadingScene.EarlyImageFileRequests,
      preloadingScene.EarlyMoveImageFileRequests,
      preloadingScene.EarlyRotateImageFileRequests,
      preloadingScene.EarlyScaleImageFileRequests,
      preloadingScene.EarlyAudioFileRequests
    );
    const blockScene =
      impowerGame && impowerDataMap
        ? new PhaserLogicScene(
            {
              key: LOGIC_SCENE_KEY,
              active,
              visible: false,
            },
            impowerGame,
            impowerDataMap
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
    this.events.on("start", () => {
      if (control) {
        this.controlScenes(control);
      }
    });
    this._project = project;
    this._impowerGame = impowerGame;
    this._impowerDataMap = impowerDataMap;
    if (this.impowerGame) {
      this.impowerGame.start();
    }
  }

  destroy(removeCanvas: boolean, noReturn?: boolean): void {
    if (this.impowerGame) {
      this.impowerGame.end();
    }
    super.destroy(removeCanvas, noReturn);
  }

  getScreenStyle(): { backgroundColor: string } {
    const { project, impowerDataMap: impowerProject, impowerGame } = this;

    const color: Color = getRuntimeValue(
      project?.instances?.configs?.data?.BackgroundConfig?.screen,
      impowerProject?.variables,
      impowerGame
    );
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
    const { project, impowerDataMap: impowerProject, impowerGame } = this;
    const color: Color = getRuntimeValue(
      project?.instances?.configs?.data?.BackgroundConfig?.game,
      impowerProject?.variables,
      impowerGame
    );
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
    const { project, impowerDataMap: impowerProject, impowerGame } = this;
    const color: Color = getRuntimeValue(
      project?.instances?.configs?.data?.BackgroundConfig?.ui,
      impowerProject?.variables,
      impowerGame
    );
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
