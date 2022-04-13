import Phaser, { GameObjects } from "phaser";
import { ImpowerGame } from "../../../../impower-game/game";
import { ImpowerContext } from "../../../../impower-game/project";
import { BlockRunner } from "../../../../impower-game/runner";

export const LOGIC_SCENE_KEY = "PhaserLogicScene";

export class PhaserLogicScene extends Phaser.Scene {
  private _impowerGame: ImpowerGame;

  public get impowerGame(): ImpowerGame {
    return this._impowerGame;
  }

  private _impowerContext: ImpowerContext;

  public get impowerContext(): ImpowerContext {
    return this._impowerContext;
  }

  constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    impowerGame: ImpowerGame,
    impowerContext: ImpowerContext
  ) {
    super(config);
    this._impowerGame = impowerGame;
    this._impowerContext = impowerContext;
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
    this.impowerGame.logic.state.loadedBlockIds.forEach((blockId) => {
      const blockStates = this.impowerGame.logic.state?.blockStates;
      const variableStates = this.impowerGame.logic.state?.variableStates;
      const blockState = blockStates[blockId];
      const context = this.impowerContext?.contexts[blockId];
      Object.entries(variableStates).forEach(([id, state]) => {
        const name = id.split(".").slice(-1).join("");
        context.valueMap[name] = state.value;
      });
      Object.entries(blockStates).forEach(([id, state]) => {
        const name = id.split(".").slice(-1).join("");
        context.valueMap[name] = state.executionCount;
      });
      if (blockState.loaded) {
        const running = BlockRunner.instance.update(
          blockId,
          blockState,
          context,
          this.impowerGame,
          time,
          delta
        );
        if (running === null) {
          this.game.destroy(true);
        }
      }
    });
  }

  create(): void {
    // NoOp
  }
}
