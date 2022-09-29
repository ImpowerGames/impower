import Phaser, { GameObjects } from "phaser";
import {
  AudioRequestProps,
  Ease,
  GameTrigger,
  ImageRequestProps,
  MoveImageRequestProps,
  RotateImageRequestProps,
  ScaleImageRequestProps,
  SparkContext,
} from "../../../../../../spark-engine";

export const ASSET_SCENE_KEY = "PhaserAssetScene";

export class PhaserAssetScene extends Phaser.Scene {
  private _sparkContext: SparkContext;

  public get sparkContext(): SparkContext {
    return this._sparkContext;
  }

  private _projectId: string;

  public get projectId(): string {
    return this._projectId;
  }

  private secondConversion = 1000; // 1 second is 1000 milliseconds

  private imageFilesInScene: { [fileId: string]: Phaser.GameObjects.Image };

  private imageFilesFromPreloading: ImageRequestProps[];

  private moveImageFilesFromPreloading: MoveImageRequestProps[];

  private rotateImageFilesFromPreloading: RotateImageRequestProps[];

  private scaleImageFilesFromPreloading: ScaleImageRequestProps[];

  private audioFilesFromPreloading: AudioRequestProps[];

  private clickableTriggerKeys: string[];

  private hoverableTriggerKeys: string[];

  private draggableTriggerKeys: string[];

  private dropableTriggerKeys: string[];

  private imageGameObjectType = "Image";

  constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    projectId: string,
    sparkContext: SparkContext,
    imageFilesFromPreloading: ImageRequestProps[],
    moveImageFilesFromPreloading: MoveImageRequestProps[],
    rotateImageFilesFromPreloading: RotateImageRequestProps[],
    scaleImageFilesFromPreloading: ScaleImageRequestProps[],
    audioFilesFromPreloading: AudioRequestProps[]
  ) {
    super(config);
    this._projectId = projectId;
    this._sparkContext = sparkContext;
    this.imageFilesFromPreloading = imageFilesFromPreloading;
    this.moveImageFilesFromPreloading = moveImageFilesFromPreloading;
    this.rotateImageFilesFromPreloading = rotateImageFilesFromPreloading;
    this.scaleImageFilesFromPreloading = scaleImageFilesFromPreloading;
    this.audioFilesFromPreloading = audioFilesFromPreloading;
    this.imageFilesInScene = {};
    this.clickableTriggerKeys = [];
    this.hoverableTriggerKeys = [];
    this.draggableTriggerKeys = [];
    this.dropableTriggerKeys = [];
  }

  handleClickDownTriggers(
    event: MouseEvent | PointerEvent | TouchEvent,
    gameObjects: GameObjects.Image[]
  ): void {
    if (event && gameObjects.length > 0) {
      const gameObject = gameObjects[0];
      if (
        gameObject.type === this.imageGameObjectType &&
        this.clickableTriggerKeys.find(
          (element) => element === gameObject.texture.key
        )
      ) {
        this.sparkContext.game.asset.clickDownImage({
          id: gameObject.texture.key,
        });
      }
    } else {
      this.sparkContext.game.input.emptyPhaserClickDown({
        event,
      });
    }
  }

  handleClickUpTriggers(
    event: MouseEvent | PointerEvent | TouchEvent,
    gameObjects: GameObjects.Image[]
  ): void {
    if (event && gameObjects.length > 0) {
      const gameObject = gameObjects[0];
      if (
        gameObject.type === this.imageGameObjectType &&
        this.clickableTriggerKeys.find(
          (element) => element === gameObject.texture.key
        )
      ) {
        this.sparkContext.game.asset.clickUpImage({
          id: gameObject.texture.key,
        });
      }
    } else {
      this.sparkContext.game.input.emptyPhaserClickUp({
        event,
      });
    }
  }

  handleHoverOverTriggers(
    event: MouseEvent | PointerEvent | TouchEvent,
    gameObjects: GameObjects.Image[]
  ): void {
    if (event && gameObjects.length > 0) {
      const gameObject = gameObjects[0];

      if (
        gameObject.type === this.imageGameObjectType &&
        this.hoverableTriggerKeys.find(
          (element) => element === gameObject.texture.key
        )
      ) {
        this.sparkContext.game.asset.hoverImage({
          id: gameObject.texture.key,
        });
      }
    }
  }

  handleDragStartTriggers(
    pointer: MouseEvent | PointerEvent | TouchEvent,
    gameObject: GameObjects.Image
  ): void {
    if (pointer && gameObject) {
      if (
        gameObject.type === this.imageGameObjectType &&
        this.draggableTriggerKeys.find(
          (element) => element === gameObject.texture.key
        )
      ) {
        this.sparkContext.game.asset.dragImage({
          id: gameObject.texture.key,
        });
      }
    }
  }

  handleDragTriggers(
    pointer: MouseEvent | PointerEvent | TouchEvent,
    gameObject: GameObjects.Image,
    dragX: number,
    dragY: number
  ): void {
    if (pointer && gameObject) {
      if (
        gameObject.type === this.imageGameObjectType &&
        this.draggableTriggerKeys.find(
          (element) => element === gameObject.texture.key
        )
      ) {
        gameObject.x = dragX;
        gameObject.y = dragY;
      }
    }
  }

  handleDropTriggers(
    pointer: MouseEvent | PointerEvent | TouchEvent,
    gameObject: GameObjects.Image,
    dropZone: GameObjects.Zone
  ): void {
    if (pointer && gameObject) {
      if (
        gameObject.type === this.imageGameObjectType &&
        this.draggableTriggerKeys.find(
          (element) => element === gameObject.texture.key
        )
      ) {
        // Snap the dragged object to the drop image
        gameObject.x = dropZone.x;
        gameObject.y = dropZone.y;
      }

      // Reset the drop image color
      const key = dropZone.name;
      if (this.dropableTriggerKeys.find((element) => element === key)) {
        const dropImage = this.imageFilesInScene[key];
        if (dropImage) {
          // Invoke the drop image event
          this.sparkContext.game.asset.dropImage({
            id: key,
          });
        }
      }
    }
  }

  handleDragLeaveTriggers(
    pointer: MouseEvent | PointerEvent | TouchEvent,
    gameObject: GameObjects.Image,
    dropZone: GameObjects.Zone
  ): void {
    if (pointer && gameObject) {
      const key = dropZone.name;
      if (this.dropableTriggerKeys.find((element) => element === key)) {
        const dropImage = this.imageFilesInScene[key];
        if (dropImage) {
          dropImage.clearTint();
        }
      }
    }
  }

  showImageFile(data: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    duration: number;
    trigger?: GameTrigger;
  }): void {
    const { id, x, y, width, height, duration, trigger } = data;

    if (id !== undefined) {
      const currentImage = this.add.image(x, y, id);

      if (currentImage) {
        currentImage.setDisplaySize(width, height);

        if (duration > 0) {
          currentImage.alpha = 0;
          this.tweens.add({
            targets: currentImage,
            alpha: 1,
            duration: duration * this.secondConversion,
          });
        } else {
          currentImage.alpha = 1;
        }

        if (trigger) {
          currentImage.setInteractive();

          switch (trigger) {
            case "Click":
              this.clickableTriggerKeys.push(id);
              break;
            case "Hover":
              this.hoverableTriggerKeys.push(id);
              break;
            case "Drag":
              this.input.setDraggable(currentImage);
              this.draggableTriggerKeys.push(id);
              break;
            case "Drop":
              this.add
                .zone(x, y, width, height)
                .setRectangleDropZone(width, height).name = id;
              this.dropableTriggerKeys.push(id);
              break;
            default:
              break;
          }
        }

        // save this image
        this.imageFilesInScene[id] = currentImage;
      }
    }
  }

  moveImageFile(data: {
    id: string;
    x: number;
    y: number;
    duration: number;
    additive: boolean;
    ease: Ease;
  }): void {
    const { id, x, y, duration, additive, ease } = data;

    const currentImage = this.imageFilesInScene[id];

    if (currentImage) {
      if (additive) {
        this.tweens.add({
          targets: currentImage,
          x: `+=${x}`,
          y: `+=${y}`,
          ease,
          duration: duration * this.secondConversion,
        });
      } else {
        this.tweens.add({
          targets: currentImage,
          x,
          y,
          ease,
          duration: duration * this.secondConversion,
        });
      }
    }
  }

  rotateImageFile(data: {
    id: string;
    angle: number;
    duration: number;
    additive: boolean;
    ease: Ease;
  }): void {
    const { id, angle, duration, additive, ease } = data;

    const currentImage = this.imageFilesInScene[id];

    if (currentImage) {
      if (additive) {
        this.tweens.add({
          targets: currentImage,
          rotation: angle,
          ease,
          duration: duration * this.secondConversion,
        });
      } else {
        this.tweens.add({
          targets: currentImage,
          angle,
          ease,
          duration: duration * this.secondConversion,
        });
      }
    }
  }

  scaleImageFile(data: {
    id: string;
    x: number;
    y: number;
    duration: number;
    additive: boolean;
    ease: Ease;
  }): void {
    const { id, x, y, duration, additive, ease } = data;

    const currentImage = this.imageFilesInScene[id];

    if (currentImage) {
      if (additive) {
        this.tweens.add({
          targets: currentImage,
          scaleX: `+=${x}`,
          scaleY: `+=${y}`,
          ease,
          duration: duration * this.secondConversion,
        });
      } else {
        this.tweens.add({
          targets: currentImage,
          scaleX: x,
          scaleY: y,
          ease,
          duration: duration * this.secondConversion,
        });
      }
    }
  }

  hideImageFile(data: { id: string; fadeOutDuration: number }): void {
    const { id, fadeOutDuration } = data;
    const currentImage: Phaser.GameObjects.Image = this.imageFilesInScene[id];
    if (currentImage) {
      if (fadeOutDuration > 0) {
        this.tweens.add({
          targets: currentImage,
          alpha: 0,
          duration: fadeOutDuration * this.secondConversion,
        });
      } else {
        currentImage.setVisible(false);
      }
    }
  }

  playAudioFile(data: {
    id: string;
    volume: number;
    loop: boolean;
    duration: number;
  }): void {
    const { id, volume, loop, duration } = data;

    if (duration > 0) {
      const currentSound = this.sound.add(id, { volume: 0, loop });
      currentSound.play();

      if (currentSound) {
        let usedDuration = duration;
        // Limit the fade to at most the entire sound duration
        if (duration >= currentSound.totalDuration) {
          usedDuration = currentSound.totalDuration;
        }

        const tween = this.tweens.add({
          targets: currentSound,
          volume: { from: 0, to: volume },
          duration: usedDuration * this.secondConversion,
        });

        currentSound.on("complete", () => {
          tween.stop();
        });
      }
    } else {
      this.sound.add(id, { volume, loop }).play();
    }
  }

  pauseAudioFile(data: { id: string; fadeOutDuration: number }): void {
    const { id, fadeOutDuration } = data;

    const currentSound = this.sound.get(id);
    if (currentSound) {
      if (fadeOutDuration > 0) {
        const activeTweens = this.tweens.getTweensOf(currentSound);

        if (activeTweens) {
          // stop all active tweens for this sound
          activeTweens.forEach((element) => {
            element.stop();
          });
        }

        let usedDuration = fadeOutDuration;
        // Limit the fade to at most the entire sound duration
        if (fadeOutDuration >= currentSound.totalDuration) {
          usedDuration = currentSound.totalDuration;
        }

        const tween = this.tweens.add({
          targets: currentSound,
          volume: 0,
          duration: usedDuration * this.secondConversion,
          onComplete: () => {
            currentSound.pause();
          },
        });

        currentSound.on("complete", () => {
          tween.stop();
        });
      } else {
        currentSound.pause();
      }
    }
  }

  resumeAudioFile(data: { id: string; duration: number }): void {
    const { id, duration } = data;

    const currentSound = this.sound.get(id);

    if (currentSound) {
      if (duration > 0) {
        currentSound.resume();

        let usedDuration = duration;
        // Limit the fade to at most the entire sound duration
        if (duration >= currentSound.totalDuration) {
          usedDuration = currentSound.totalDuration;
        }

        const tween = this.tweens.add({
          targets: currentSound,
          // TODO: use the original volume value set in the play command
          volume: { from: 0, to: 1 },
          duration: usedDuration * this.secondConversion,
        });

        currentSound.on("complete", () => {
          tween.stop();
        });
      } else {
        currentSound.resume();
      }
    }
  }

  stopAudioFile(data: { id: string; fadeOutDuration: number }): void {
    const { id, fadeOutDuration } = data;
    const currentSound = this.sound.get(id);

    if (currentSound) {
      if (fadeOutDuration > 0) {
        const activeTweens = this.tweens.getTweensOf(currentSound);

        if (activeTweens) {
          // stop all active tweens for this sound
          activeTweens.forEach((element) => {
            element.stop();
          });
        }

        let usedDuration = fadeOutDuration;
        // Limit the fade to at most the entire sound duration
        if (fadeOutDuration >= currentSound.totalDuration) {
          usedDuration = currentSound.totalDuration;
        }

        const tween = this.tweens.add({
          targets: currentSound,
          volume: 0,
          duration: usedDuration * this.secondConversion,
          onComplete: () => {
            currentSound.stop();
          },
        });

        currentSound.on("complete", () => {
          tween.stop();
        });
      } else {
        currentSound.stop();
      }
    }
  }

  preload(): void {
    this.sparkContext.game.asset.events.onPlayAudioFile.addListener(
      this.playAudioFile.bind(this)
    );
    this.sparkContext.game.asset.events.onPauseAudioFile.addListener(
      this.pauseAudioFile.bind(this)
    );
    this.sparkContext.game.asset.events.onResumeAudioFile.addListener(
      this.resumeAudioFile.bind(this)
    );
    this.sparkContext.game.asset.events.onStopAudioFile.addListener(
      this.stopAudioFile.bind(this)
    );
    this.sparkContext.game.asset.events.onShowImageFile.addListener(
      this.showImageFile.bind(this)
    );
    this.sparkContext.game.asset.events.onMoveImageFile.addListener(
      this.moveImageFile.bind(this)
    );
    this.sparkContext.game.asset.events.onRotateImageFile.addListener(
      this.rotateImageFile.bind(this)
    );
    this.sparkContext.game.asset.events.onScaleImageFile.addListener(
      this.scaleImageFile.bind(this)
    );
    this.sparkContext.game.asset.events.onHideImageFile.addListener(
      this.hideImageFile.bind(this)
    );

    this.input.on("pointerdown", this.handleClickDownTriggers.bind(this));
    this.input.on("pointerup", this.handleClickUpTriggers.bind(this));
    this.input.on("pointerover", this.handleHoverOverTriggers.bind(this));
    this.input.on("dragstart", this.handleDragStartTriggers.bind(this));
    this.input.on("drag", this.handleDragTriggers.bind(this));
    this.input.on("drop", this.handleDropTriggers.bind(this));
    this.input.on("dragleave", this.handleDragLeaveTriggers.bind(this));
  }

  create(): void {
    this.imageFilesFromPreloading.forEach((element) => {
      this.showImageFile({
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        duration: element.duration,
        trigger: element.trigger,
      });
    });

    this.moveImageFilesFromPreloading.forEach((element) => {
      this.moveImageFile({
        id: element.id,
        x: element.x,
        y: element.y,
        ease: element.ease,
        duration: element.duration,
        additive: element.additive,
      });
    });

    this.rotateImageFilesFromPreloading.forEach((element) => {
      this.rotateImageFile({
        id: element.id,
        angle: element.angle,
        ease: element.ease,
        duration: element.duration,
        additive: element.additive,
      });
    });

    this.scaleImageFilesFromPreloading.forEach((element) => {
      this.scaleImageFile({
        id: element.id,
        x: element.x,
        y: element.y,
        ease: element.ease,
        duration: element.duration,
        additive: element.additive,
      });
    });

    this.audioFilesFromPreloading.forEach((element) => {
      this.playAudioFile({
        id: element.id,
        volume: element.volume,
        loop: element.loop,
        duration: element.duration,
      });
    });

    delete this.imageFilesFromPreloading;
    delete this.moveImageFilesFromPreloading;
    delete this.rotateImageFilesFromPreloading;
    delete this.scaleImageFilesFromPreloading;
    delete this.audioFilesFromPreloading;

    this.scale.refresh();
  }
}
