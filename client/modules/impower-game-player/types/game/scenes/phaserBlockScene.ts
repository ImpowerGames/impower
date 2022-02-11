import Phaser from "phaser";
import { ImpowerGame } from "../../../../impower-game/game";
import { ImpowerDataMap } from "../../../../impower-game/project";
import { Choice } from "../../../../impower-script-engine";

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

  private _activeIds: string[];

  private _activeChoices: Set<Choice> = new Set();

  constructor(
    config: string | Phaser.Types.Scenes.SettingsConfig,
    impowerGame: ImpowerGame,
    impowerDataMap: ImpowerDataMap
  ) {
    super(config);
    this._impowerGame = impowerGame;
    this._impowerDataMap = impowerDataMap;
    this._activeIds = Object.keys(impowerDataMap.blocks);
  }

  update(time: number, delta: number): void {
    this._activeIds.forEach((id) => {
      const story = this._impowerDataMap.scripts[id];
      if (story) {
        while (story.canContinue) {
          console.log(story.Continue());
        }
        if (story.currentChoices.length > 0) {
          for (let i = 0; i < story.currentChoices.length; i += 1) {
            const choice = story.currentChoices[i];
            if (!this._activeChoices.has(choice)) {
              console.log(`Choice ${i + 1}. ${choice.text}`);
            }
            this._activeChoices.add(choice);
          }
        }
      }
    });
  }

  create(): void {
    // TODO
  }
}
