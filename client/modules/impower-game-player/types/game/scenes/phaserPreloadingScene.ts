import Phaser from "phaser";
import { FileExtension, FileType, Vector2 } from "../../../../impower-core";
import { FileData } from "../../../../impower-game/data";
import { Ease } from "../../../../impower-game/data/enums/ease";
import { GameTrigger } from "../../../../impower-game/data/enums/gameTrigger";
import { isLoadableFile } from "../../../../impower-game/data/interfaces/loadableFile";
import { AudioRequestProps } from "../../../../impower-game/data/interfaces/props/audioRequestProps";
import { ImageRequestProps } from "../../../../impower-game/data/interfaces/props/imageRequestProps";
import { MoveImageRequestProps } from "../../../../impower-game/data/interfaces/props/moveImageRequestProps";
import { RotateImageRequestProps } from "../../../../impower-game/data/interfaces/props/rotateImageRequestProps";
import { ScaleImageRequestProps } from "../../../../impower-game/data/interfaces/props/scaleImageRequestProps";
import { ImpowerGame } from "../../../../impower-game/game";
import { ImpowerDataMap } from "../../../../impower-game/project";
import { ElementData } from "../../../../impower-game/project/classes/instances/items/element/elementData";
import { UIElementProps } from "../../../../impower-game/project/classes/instances/items/elements/uiElement/uiElementData";
import { ASSET_SCENE_KEY } from "./phaserAssetScene";

export const PRELOADING_SCENE_KEY = "PhaserPreloadingScene";

enum PhaserEvents {
  progress = "progress",
  fileprogress = "fileprogress",
  complete = "complete",
}

export class PhaserPreloadingScene extends Phaser.Scene {
  private _impowerGame: ImpowerGame;

  public get impowerGame(): ImpowerGame {
    return this._impowerGame;
  }

  private _impowerDataMap: ImpowerDataMap;

  public get impowerDataMap(): ImpowerDataMap {
    return this._impowerDataMap;
  }

  private earlyImageFileRequests: ImageRequestProps[];

  public get EarlyImageFileRequests(): ImageRequestProps[] {
    return this.earlyImageFileRequests;
  }

  private earlyMoveImageFileRequests: MoveImageRequestProps[];

  public get EarlyMoveImageFileRequests(): MoveImageRequestProps[] {
    return this.earlyMoveImageFileRequests;
  }

  private earlyRotateImageFileRequests: RotateImageRequestProps[];

  public get EarlyRotateImageFileRequests(): RotateImageRequestProps[] {
    return this.earlyRotateImageFileRequests;
  }

  private earlyScaleImageFileRequests: ScaleImageRequestProps[];

  public get EarlyScaleImageFileRequests(): ScaleImageRequestProps[] {
    return this.earlyScaleImageFileRequests;
  }

  private earlyAudioFileRequests: AudioRequestProps[];

  public get EarlyAudioFileRequests(): AudioRequestProps[] {
    return this.earlyAudioFileRequests;
  }

  private progressBoxWidth = 320;

  private progressBoxHeight = 50;

  private progressBoxFill = 0x222222;

  private progressBoxPos: Vector2 = { x: 0, y: -60 };

  private progressBarWidth = 300;

  private progressBarHeight = 30;

  private progressBarFill = 0x0084ff;

  private progressBarPos: Vector2 = { x: 0, y: -60 };

  private loadingTextColor = "#ffffff";

  private percentTextColor = "#ffffff";

  private assetTextColor = "#ffffff";

  private loadingTextFontSize = "20px";

  private percentTextFontSize = "18px";

  private assetTextFontSize = "18px";

  private loadingTextFont = "arial";

  private percentTextFont = "arial";

  private assetTextFont = "arial";

  private refTypeImage = "image";

  private refTypeAudio = "audio";

  private loadingTextPos: Vector2 = { x: 0, y: -110 };

  private percentTextPos: Vector2 = { x: 0, y: -60 };

  private assetTextPos: Vector2 = { x: 0, y: -10 };

  constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    impowerGame: ImpowerGame,
    impowerDataMap: ImpowerDataMap
  ) {
    super(config);
    this._impowerGame = impowerGame;
    this._impowerDataMap = impowerDataMap;
    this.earlyAudioFileRequests = [];
    this.earlyImageFileRequests = [];
    this.earlyMoveImageFileRequests = [];
    this.earlyRotateImageFileRequests = [];
    this.earlyScaleImageFileRequests = [];
  }

  preload(): void {
    this.displayPreloading();

    this.impowerGame.asset.events.onPlayAudioFile.addListener(
      this.saveEarlyAudio.bind(this)
    );
    this.impowerGame.asset.events.onShowImageFile.addListener(
      this.saveEarlyImages.bind(this)
    );
    this.impowerGame.asset.events.onMoveImageFile.addListener(
      this.saveEarlyMoveImages.bind(this)
    );
    this.impowerGame.asset.events.onRotateImageFile.addListener(
      this.saveEarlyRotateImages.bind(this)
    );
    this.impowerGame.asset.events.onScaleImageFile.addListener(
      this.saveEarlyScaleImages.bind(this)
    );
    this.impowerGame.asset.events.onMarkImageAsClickTrigger.addListener(
      this.saveEarlyMarkImageAsClickTrigger.bind(this)
    );
    this.impowerGame.asset.events.onMarkImageAsDragTrigger.addListener(
      this.saveEarlyMarkImageAsDragTrigger.bind(this)
    );
    this.impowerGame.asset.events.onMarkImageAsDropTrigger.addListener(
      this.saveEarlyMarkImageAsDropTrigger.bind(this)
    );
    this.impowerGame.asset.events.onMarkImageAsHoverTrigger.addListener(
      this.saveEarlyMarkImageAsHoverTrigger.bind(this)
    );

    // Only load assets that are used in current commands
    this.impowerGame.logic.state.activeBlockIds.forEach((id) => {
      const { commands, triggers } =
        this.impowerDataMap.blockInternalRunners[id];
      const { variables } = this.impowerDataMap;

      let refId: string;
      let refUrl: string;
      let refType: FileType;
      let refExt: FileExtension;

      triggers.forEach((element) => {
        if (isLoadableFile(element.runner)) {
          refId = element.runner.getFileId(
            element.data,
            variables,
            this.impowerGame
          );
          const dataMapFiles: FileData = this.impowerDataMap.files[refId];
          if (dataMapFiles) {
            refUrl = dataMapFiles.fileUrl;
            refType = dataMapFiles.fileType as FileType;
            if (refType.toLowerCase().startsWith(this.refTypeImage)) {
              this.load.image(refId, refUrl);
            }
          }
        }
      });

      commands.forEach((element) => {
        if (isLoadableFile(element.runner)) {
          refId = element.runner.getFileId(
            element.data,
            variables,
            this.impowerGame
          );
          const dataMapFile = this.impowerDataMap.files[refId];

          if (dataMapFile) {
            refUrl = dataMapFile.fileUrl;
            refType = dataMapFile.fileType as FileType;
            if (refType.toLowerCase().startsWith(this.refTypeImage)) {
              this.load.image(refId, refUrl);
            }
            if (refType.toLowerCase().startsWith(this.refTypeAudio)) {
              // Unlike images, Phaser cannot determine this is an audio file by the url.
              // Force Phaser to treat it as an audio file by adding the audio file extension.
              refExt = dataMapFile.fileExtension as FileExtension;
              this.load.audio(refId, `${refUrl}.${refExt}`);
            }
          }
        }
      });
    });
  }

  displayPreloading(): void {
    const { width, height } = this.cameras.main;
    const screenCenterX = width / 2;
    const screenCenterY = height / 2;
    const progressBarCenterX =
      screenCenterX - this.progressBarWidth / 2 + this.progressBarPos.x;
    const progressBarCenterY =
      screenCenterY - this.progressBarHeight / 2 + this.progressBarPos.y;
    const progressBoxCenterX =
      screenCenterX - this.progressBoxWidth / 2 + this.progressBoxPos.x;
    const progressBoxCenterY =
      screenCenterY - this.progressBoxHeight / 2 + this.progressBoxPos.y;

    const progressBox = this.add.graphics();
    const progressBar = this.add.graphics();
    progressBox.fillStyle(this.progressBoxFill, 0.8);
    progressBox.fillRect(
      progressBoxCenterX,
      progressBoxCenterY,
      this.progressBoxWidth,
      this.progressBoxHeight
    );

    const loadingText = this.make.text({
      x: screenCenterX + this.loadingTextPos.x,
      y: screenCenterY + this.loadingTextPos.y,
      text: "Loading...",
      style: {
        font: `${this.loadingTextFontSize} ${this.loadingTextFont}`,
        color: this.loadingTextColor,
      },
    });
    loadingText.setOrigin(0.5, 0.5);

    const percentText = this.make.text({
      x: screenCenterX + this.percentTextPos.x,
      y: screenCenterY + this.percentTextPos.y,
      text: "0%",
      style: {
        font: `${this.percentTextFontSize} ${this.percentTextFont}`,
        color: this.percentTextColor,
      },
    });
    percentText.setOrigin(0.5, 0.5);

    const assetText = this.make.text({
      x: screenCenterX + this.assetTextPos.x,
      y: screenCenterY + this.assetTextPos.y,
      text: "",
      style: {
        font: `${this.assetTextFontSize} ${this.assetTextFont}`,
        color: this.assetTextColor,
      },
    });
    assetText.setOrigin(0.5, 0.5);

    const barFill = this.progressBarFill;
    const barWidth = this.progressBarWidth;
    const barHeight = this.progressBarHeight;
    this.load.on(PhaserEvents.progress, (value) => {
      progressBar.clear();
      progressBar.fillStyle(barFill, 1);
      progressBar.fillRect(
        progressBarCenterX,
        progressBarCenterY,
        barWidth * value,
        barHeight
      );
      percentText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.on(PhaserEvents.fileprogress, (file) => {
      assetText.setText(`Loading asset: ${file.key}`);
    });

    this.load.on(PhaserEvents.complete, () => {
      percentText.destroy();
      assetText.destroy();
      loadingText.destroy();

      progressBox.destroy();
      progressBar.destroy();
    });
  }

  saveEarlyImages(data: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    duration: number;
    trigger?: GameTrigger;
  }): void {
    const { id, x, y, width, height, duration, trigger } = data;

    const imageIndex = this.earlyImageFileRequests.findIndex((element) => {
      return element.id === id;
    });

    if (imageIndex < 0) {
      this.earlyImageFileRequests.push({
        id,
        x,
        y,
        width,
        height,
        duration,
        trigger,
      });
    } else {
      // Update the existing image that was generated by a default value
      this.earlyImageFileRequests[imageIndex].x = x;
      this.earlyImageFileRequests[imageIndex].y = y;
      this.earlyImageFileRequests[imageIndex].width = width;
      this.earlyImageFileRequests[imageIndex].height = height;
      this.earlyImageFileRequests[imageIndex].duration = duration;
    }
  }

  saveEarlyMoveImages(data: {
    id: string;
    x: number;
    y: number;
    ease: Ease;
    duration: number;
    additive: boolean;
  }): void {
    const { id, x, y, ease, duration, additive } = data;
    this.earlyMoveImageFileRequests.push({
      id,
      x,
      y,
      ease,
      duration,
      additive,
    });
  }

  saveEarlyRotateImages(data: {
    id: string;
    angle: number;
    ease: Ease;
    duration: number;
    additive: boolean;
  }): void {
    const { id, angle, ease, duration, additive } = data;
    this.earlyRotateImageFileRequests.push({
      id,
      angle,
      ease,
      duration,
      additive,
    });
  }

  saveEarlyScaleImages(data: {
    id: string;
    x: number;
    y: number;
    ease: Ease;
    duration: number;
    additive: boolean;
  }): void {
    const { id, x, y, ease, duration, additive } = data;
    this.earlyScaleImageFileRequests.push({
      id,
      x,
      y,
      ease,
      duration,
      additive,
    });
  }

  saveEarlyCreateTriggers(data: {
    imageRefId: string;
    constructRefId: string;
    elementRefId: string;
    trigger: GameTrigger;
  }): void {
    const { imageRefId, elementRefId, trigger } = data;
    const constructInfo = this.impowerGame.entity.state.loadedConstructs.map(
      (id) => this.impowerDataMap.constructs[id]
    );

    const elementData: ElementData = constructInfo[0].data[elementRefId];
    const { size, position } = elementData as unknown as UIElementProps;

    const x = position.value.left.value as unknown as number;
    const y = position.value.top.value as unknown as number;
    const width = size.value.width.value as unknown as number;
    const height = size.value.height.value as unknown as number;

    // Create the debug image
    this.earlyImageFileRequests.push({
      id: imageRefId,
      x,
      y,
      width,
      height,
      duration: 0,
      trigger,
    });
  }

  saveEarlyMarkImageAsClickTrigger(data: { id: string }): void {
    const image = this.earlyImageFileRequests.find((element) => {
      return element.id === data.id;
    });

    if (image !== undefined) {
      image.trigger = GameTrigger.Click;
    }
  }

  saveEarlyMarkImageAsDragTrigger(data: { id: string }): void {
    const image = this.earlyImageFileRequests.find((element) => {
      return element.id === data.id;
    });

    if (image !== undefined) {
      image.trigger = GameTrigger.Drag;
    }
  }

  saveEarlyMarkImageAsDropTrigger(data: { id: string }): void {
    const image = this.earlyImageFileRequests.find((element) => {
      return element.id === data.id;
    });

    if (image !== undefined) {
      image.trigger = GameTrigger.Drop;
    }
  }

  saveEarlyMarkImageAsHoverTrigger(data: { id: string }): void {
    const image = this.earlyImageFileRequests.find((element) => {
      return element.id === data.id;
    });

    if (image !== undefined) {
      image.trigger = GameTrigger.Hover;
    }
  }

  saveEarlyAudio(data: {
    id: string;
    volume: number;
    loop: boolean;
    duration: number;
  }): void {
    const { id, volume, loop, duration } = data;

    this.earlyAudioFileRequests.push({
      id,
      volume,
      loop,
      duration,
    });
  }

  create(): void {
    this.impowerGame.asset.events.onPlayAudioFile.removeAllListeners();
    this.impowerGame.asset.events.onShowImageFile.removeAllListeners();
    this.impowerGame.asset.events.onMoveImageFile.removeAllListeners();
    this.impowerGame.asset.events.onRotateImageFile.removeAllListeners();
    this.impowerGame.asset.events.onScaleImageFile.removeAllListeners();

    this.scene.start(ASSET_SCENE_KEY);
    this.scene.stop(PRELOADING_SCENE_KEY);
  }
}
