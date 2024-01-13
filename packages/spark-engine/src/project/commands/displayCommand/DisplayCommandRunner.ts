import { Game } from "../../../game/core/classes/Game";
import { CommandRunner } from "../../command/CommandRunner";
import { DisplayCommandData } from "./DisplayCommandData";
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

  protected _waitingForChoice = false;

  protected _chosenBlockId: string | undefined = undefined;

  protected _onTick?: (deltaMS: number) => void;

  override onExecute(data: DisplayCommandData): number[] {
    const currentBlockId = data.reference.parentId;
    const currentCommandId = data.reference.id;
    this.game.checkpoint(currentCommandId);
    this._wasPressed = false;
    this._wasTyped = false;
    this._timeTypedMS = -1;
    this._elapsedMS = 0;
    this.game.input.events.onPointerDown.addListener(this.onPointerDown);
    this._waitingForChoice = data?.params?.content?.some((p) => p.button);
    this._chosenBlockId = undefined;
    this._onTick = executeDisplayCommand(
      this.game,
      data,
      {},
      () => {
        this._wasTyped = true;
      },
      (instance, jump) => {
        this._chosenBlockId = this.game.logic.choose(
          currentBlockId,
          currentCommandId + "." + instance || "",
          typeof jump === "string" ? jump : "",
          data.source
        );
      }
    );
    this._onTick?.(0);
    return super.onExecute(data);
  }

  override onUpdate(deltaMS: number): void {
    if (this._onTick) {
      this._onTick(deltaMS);
      this._elapsedMS += deltaMS;
    }
  }

  override onDestroy(): void {
    this._onTick = undefined;
    this.game.input.events.onPointerDown.removeListener(this.onPointerDown);
  }

  onPointerDown = () => {
    this._wasPressed = true;
  };

  override isFinished(data: DisplayCommandData): boolean {
    const { autoAdvance } = data.params;
    const blockState = this.game.logic.state.blocks[data.reference.parentId];
    if (!blockState) {
      return false;
    }
    if (this._wasTyped && this._timeTypedMS < 0) {
      this._timeTypedMS = this._elapsedMS;
    }
    const timeMSSinceTyped = this._elapsedMS - this._timeTypedMS;
    if (
      !this._waitingForChoice &&
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
        if (!this._waitingForChoice) {
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
      if (!this._waitingForChoice) {
        executeDisplayCommand(this.game, data, {
          instant: true,
        });
      }
    }
    if (this._waitingForChoice && this._chosenBlockId != null) {
      const chosenBlockId = this._chosenBlockId;
      this._chosenBlockId = undefined;

      if (chosenBlockId === "") {
        return true;
      }

      const currentBlockId = data.reference.parentId;
      const currentCommandIndex = data.reference.index;
      this.game.logic.jumpToBlock(
        currentBlockId,
        currentCommandIndex,
        chosenBlockId
      );
    }
    return false;
  }

  override onPreview(data: DisplayCommandData): boolean {
    executeDisplayCommand(this.game, data, { instant: true, preview: true });
    return true;
  }
}
