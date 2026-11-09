import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { PresentOptions, Presenter } from "./Presenter";
import { clearStage, writeStage } from "./stage";

export class StagePresenter implements Presenter {
  protected _game: Game;

  protected _instructions: Instructions;

  protected _options: PresentOptions;

  constructor(game: Game, instructions: Instructions, options: PresentOptions) {
    this._game = game;
    this._instructions = instructions;
    this._options = options;
  }

  present(time?: number): void {
    const ui = this._game.module.ui;
    const composed = ui.beginCompose();
    clearStage(this._game, this._instructions, ui.getTransientTargets());
    ui.reveal();
    writeStage(this._game, this._instructions, this._options.instant, time);
    if (composed) {
      void ui.endCompose(time != null ? { time } : {});
    }
  }

  finish(): void {}
}
