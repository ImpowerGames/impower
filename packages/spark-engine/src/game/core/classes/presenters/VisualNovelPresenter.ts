import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { PresentOptions, Presenter } from "./Presenter";
import { clearStage, writeStage } from "./stage";

export function writeBeatText(
  ui: Game["module"]["ui"],
  instructions: Instructions,
  instant = false,
  time?: number,
): Promise<void>[] {
  return Object.entries(instructions.text ?? {}).map(([target, events]) =>
    ui.text.write(
      target,
      events,
      instant,
      time,
      instant ? 0 : (instructions.extended?.[target] ?? 0),
    ),
  );
}

export class VisualNovelPresenter implements Presenter {
  protected _game: Game;

  protected _instructions: Instructions;

  protected _options: PresentOptions;

  protected _transientLayers: string[];

  constructor(game: Game, instructions: Instructions, options: PresentOptions) {
    this._game = game;
    this._instructions = instructions;
    this._options = options;
    this._transientLayers = game.module.ui.getTransientTargets();
  }

  present(time?: number): void {
    const game = this._game;
    const composed = game.module.ui.beginCompose();
    this.writeUI(time);
    if (composed) {
      void game.module.ui.endCompose(time != null ? { time } : {});
    }
  }

  finish(): void {
    const indicatorStyle: Record<string, string | null> = {};
    indicatorStyle["transition"] = null;
    indicatorStyle["opacity"] = "1";
    indicatorStyle["animation-play-state"] = this._options.preview
      ? "paused"
      : "running";
    this._game.module.ui.style.update("continue_indicator", indicatorStyle);
  }

  protected writeUI(time?: number): void {
    const game = this._game;
    const instructions = this._instructions;
    const autoAdvance = instructions?.auto;
    const instant = this._options.instant;
    const choose = this._options.choose;
    const transientLayers = this._transientLayers;
    const extended = Boolean(instructions.extended);

    if (!extended || instructions.text) {
      game.module.ui.text.clearAll(transientLayers);
    }
    clearStage(game, instructions, transientLayers);

    game.module.ui.reveal();

    const indicatorStyle: Record<string, string | null> = {};
    if (autoAdvance || game.shownEnding) {
      indicatorStyle["display"] = "none";
    } else {
      indicatorStyle["transition"] = "none";
      indicatorStyle["opacity"] = instant ? "1" : "0";
      indicatorStyle["animation-play-state"] = "paused";
      indicatorStyle["display"] = null;
    }
    game.module.ui.style.update("continue_indicator", indicatorStyle);

    const choiceTargets = instructions.choices;
    if (choiceTargets) {
      choiceTargets.forEach((target, index) => {
        const handleClick = (): void => {
          if (game.ending) {
            return;
          }
          game.module.ui.text.clearAll(choiceTargets);
          game.module.ui.image.clearAll(choiceTargets);
          game.module.ui.unobserve("click", target);
          game.module.ui.hideAll(choiceTargets);
          choose(index);
        };
        game.module.ui.observe("click", target, handleClick);
      });
    }

    writeBeatText(game.module.ui, instructions, instant, time);

    writeStage(game, instructions, instant, time);
  }
}
