import Phaser, { GameObjects } from "phaser";
import { ImpowerGame } from "../../../../impower-game/game";
import { ImpowerDataMap } from "../../../../impower-game/project";
import { BlockRunner } from "../../../../impower-game/runner";

export const LOGIC_SCENE_KEY = "PhaserLogicScene";

export class PhaserLogicScene extends Phaser.Scene {
  private _impowerGame: ImpowerGame;

  public get impowerGame(): ImpowerGame {
    return this._impowerGame;
  }

  private _impowerDataMap: ImpowerDataMap;

  public get impowerDataMap(): ImpowerDataMap {
    return this._impowerDataMap;
  }

  constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    impowerGame: ImpowerGame,
    impowerDataMap: ImpowerDataMap
  ) {
    super(config);
    this._impowerGame = impowerGame;
    this._impowerDataMap = impowerDataMap;
  }

  preload(): void {
    this.input.on("pointerdown", (e, g) => this.onPointerDown(e, g));
    this.input.on("pointerup", (e, g) => this.onPointerUp(e, g));
  }

  onPointerDown(
    event: PointerEvent,
    gameObjects: GameObjects.GameObject[]
  ): void {
    this.impowerGame.input.pointerDown({
      button: event.button,
      targets: gameObjects.map((x) => x.name),
    });
  }

  onPointerUp(
    event: PointerEvent,
    gameObjects: GameObjects.GameObject[]
  ): void {
    this.impowerGame.input.pointerUp({
      button: event.button,
      targets: gameObjects.map((x) => x.name),
    });
  }

  update(time: number, delta: number): void {
    this.impowerGame.logic.state.activeChildBlocks.forEach((id) => {
      const blockState = this.impowerGame.logic.state.blockStates[id];
      const { triggers, commands } =
        this.impowerDataMap.blockInternalRunners[id];
      const { variables } = this.impowerDataMap;
      if (blockState.active) {
        BlockRunner.instance.update(
          id,
          blockState,
          triggers,
          commands,
          variables,
          this.impowerGame,
          time,
          delta
        );
      }
    });
  }

  create(): void {
    this.impowerGame.logic.state.activeChildBlocks.forEach((id) => {
      const blockState = this.impowerGame.logic.state.blockStates[id];
      const { triggers, commands } =
        this.impowerDataMap.blockInternalRunners[id];
      const { variables } = this.impowerDataMap;
      if (blockState.active) {
        BlockRunner.instance.init(
          triggers,
          commands,
          variables,
          this.impowerGame
        );
      }
    });
  }
}
