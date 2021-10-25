import Phaser from "phaser";
import { ImpowerGame } from "../../../../impower-game/game";
import { BlockRunner } from "../../../../impower-game/runner";
import { ImpowerDataMap } from "../../../../impower-game/project";

export const BLOCK_SCENE_KEY = "PhaserBlockScene";

export class PhaserBlockScene extends Phaser.Scene {
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

  update(time: number, delta: number): void {
    this.impowerGame.logic.state.activeBlockIds.forEach((id) => {
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
    this.impowerGame.logic.state.activeBlockIds.forEach((id) => {
      const blockState = this.impowerGame.logic.state.blockStates[id];
      const { triggers } = this.impowerDataMap.blockInternalRunners[id];
      const { variables } = this.impowerDataMap;
      if (blockState.active) {
        BlockRunner.instance.initialize(triggers, variables, this.impowerGame);
      }
    });
  }
}
