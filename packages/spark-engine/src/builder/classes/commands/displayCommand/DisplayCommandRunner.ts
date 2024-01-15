import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { DisplayCommandData } from "./DisplayCommandData";
import { DisplayContentItem } from "./DisplayCommandParams";
import { executeDisplayCommand } from "./utils/executeDisplayCommand";

export class DisplayCommandRunner<G extends Game> extends CommandRunner<
  G,
  DisplayCommandData
> {
  protected _autoDelay = 0.5;

  protected _wasPressed = false;

  protected _wasTyped = false;

  protected _timeTypedMS = -1;

  protected _elapsedMS = 0;

  protected _choices: DisplayContentItem[] | undefined = undefined;

  protected _chosenBlockId: string | undefined = undefined;

  protected _onTick?: (deltaMS: number) => void;

  override willSaveCheckpoint(_data: DisplayCommandData): boolean {
    return true;
  }

  override onExecute(data: DisplayCommandData) {
    this._wasPressed = false;
    this._wasTyped = false;
    this._timeTypedMS = -1;
    this._elapsedMS = 0;
    this.game.input.events.onPointerDown.addListener(this.onPointerDown);
    this._chosenBlockId = undefined;
    const { onTick, displayed } = executeDisplayCommand(
      this.game,
      data,
      {},
      () => {
        this._wasTyped = true;
      },
      (c) => {
        const choiceId = data.id + "." + c.instance || "";
        const jumpTo = c.button || "";
        this._chosenBlockId = this.game.logic.choose(
          data.parent,
          choiceId,
          jumpTo,
          data.source
        );
      }
    );
    this._choices = displayed?.filter((c) => c.button);
    this._onTick = onTick;
    this._onTick?.(0);

    return super.onExecute(data);
  }

  override onUpdate(deltaMS: number) {
    if (this._onTick) {
      this._onTick(deltaMS);
      this._elapsedMS += deltaMS;
    }
  }

  override onDestroy() {
    this._onTick = undefined;
    this.game.input.events.onPointerDown.removeListener(this.onPointerDown);
  }

  onPointerDown = () => {
    this._wasPressed = true;
  };

  override isFinished(data: DisplayCommandData) {
    const simulating = this.game.context?.game?.simulating;
    if (simulating) {
      // TODO: If waiting for user choice, prioritize choiceIds included in waypoints
      // if (this._choices && this._choices.length > 0) {
      //   const lastVisibleChoice = this._choices.at(-1)!;
      //   const choiceId = data.id + "." + lastVisibleChoice.instance || "";
      //   const jumpTo = lastVisibleChoice.button || "";
      //   this._chosenBlockId = this.game.logic.choose(
      //     data.parent,
      //     choiceId,
      //     jumpTo,
      //     data.source
      //   );
      // } else {
      //   return true;
      // }
      return true;
    }
    const { autoAdvance } = data.params;
    const waitingForChoice = this._choices && this._choices.length > 0;
    const blockState = this.game.logic.state.blocks?.[data.parent];
    if (!blockState) {
      return false;
    }
    if (this._wasTyped && this._timeTypedMS < 0) {
      this._timeTypedMS = this._elapsedMS;
    }
    const timeMSSinceTyped = this._elapsedMS - this._timeTypedMS;
    if (
      !waitingForChoice &&
      autoAdvance &&
      this._wasTyped &&
      timeMSSinceTyped / 1000 >= this._autoDelay
    ) {
      return true;
    }
    if (this._wasPressed) {
      this._wasPressed = false;
      if (this._wasTyped) {
        this._wasTyped = false;
        if (!waitingForChoice) {
          return true;
        }
      }
      let msAfterStopped = 0;
      this._onTick = (deltaMS: number) => {
        // Wait until typing sound has had enough time to fade out
        // So that it doesn't crackle when cut short
        msAfterStopped += deltaMS;
        const elapsed = msAfterStopped / 1000;
        if (elapsed > 0.03) {
          this._wasTyped = true;
        }
      };
      if (!waitingForChoice) {
        executeDisplayCommand(this.game, data, {
          instant: true,
        });
      }
    }
    if (waitingForChoice && this._chosenBlockId != null) {
      const chosenBlockId = this._chosenBlockId;
      this._chosenBlockId = undefined;

      if (chosenBlockId === "") {
        return true;
      }

      this.game.logic.jumpToBlock(data.parent, data.index, chosenBlockId);
    }
    return false;
  }

  override onPreview(data: DisplayCommandData) {
    executeDisplayCommand(this.game, data, { instant: true, preview: true });
    return true;
  }
}
