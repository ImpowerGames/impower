import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";
import type { PresentOptions, Presenter } from "./Presenter";
import { applyLayoutDirectives, clearStage, writeStage } from "./stage";
import { opensTextLayout, presentsText } from "./textLayouts";

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
    const presentation = game.module.ui.beginPresentation();
    const composed = game.module.ui.beginCompose();
    const written = this.writeUI(time);
    if (composed) {
      void game.module.ui.endCompose(time != null ? { time } : {});
    }
    this.redeliverAfterLayouts(presentation, written);
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

  protected writeUI(time?: number): string[][] {
    const game = this._game;
    const instructions = this._instructions;
    const instant = this._options.instant;
    const transientLayers = this._transientLayers;
    const extended = Boolean(instructions.extended);

    const layoutsFirst = opensTextLayout(game, instructions);
    if (layoutsFirst) {
      applyLayoutDirectives(game, instructions, instant);
    }

    if (!extended || instructions.text) {
      game.module.ui.text.clearAll(transientLayers);
    }
    clearStage(game, instructions, transientLayers);

    game.module.ui.reveal();

    this.writeContent(instant, time);
    const written = this.textElementIds();

    writeStage(game, instructions, instant, time, layoutsFirst);
    return written;
  }

  protected writeContent(instant?: boolean, time?: number): void {
    const game = this._game;
    const instructions = this._instructions;
    const autoAdvance = instructions?.auto;
    const choose = this._options.choose;

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
  }

  protected textElementIds(): string[][] {
    const ui = this._game.module.ui;
    const targets = [
      ...Object.keys(this._instructions.text ?? {}),
      ...(this._instructions.choices ?? []),
    ];
    return targets.map((target) => ui.findIds(target));
  }

  protected redeliverAfterLayouts(
    presentation: number,
    written: string[][],
  ): void {
    const game = this._game;
    const ui = game.module.ui;
    if (
      !presentsText(this._instructions) ||
      game.context.system.simulating ||
      game.replaying
    ) {
      return;
    }
    const settled = ui.whenLayoutsSettled();
    if (!settled) {
      return;
    }
    void settled.then(() => {
      const lostTarget = this.textElementIds().some((ids, index) => {
        const before = written[index] ?? [];
        return (
          ids.some((id) => !before.includes(id)) &&
          (before.length === 0 || before.some((id) => !ids.includes(id)))
        );
      });
      if (!ui.isCurrentPresentation(presentation) || !lostTarget) {
        return;
      }
      const composed = ui.beginCompose();
      ui.text.clearAll(this._transientLayers);
      this.writeContent(true);
      ui.reveal();
      ui.refreshLayouts();
      if (composed) {
        void ui.endCompose({});
      }
    });
  }
}
