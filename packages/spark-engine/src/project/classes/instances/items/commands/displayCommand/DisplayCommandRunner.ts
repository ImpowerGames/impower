import getRelativeSectionName from "../../../../../../../../sparkdown/src/utils/getRelativeSectionName";
import { SparkGame } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";
import { DisplayCommandData } from "./DisplayCommandData";
import { executeDisplayCommand } from "./executeDisplayCommand";

export class DisplayCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  DisplayCommandData
> {
  autoDelay = 0.5;

  down = false;

  wasPressed = false;

  wasTyped = false;

  timeTypedMS = -1;

  elapsedMS = 0;

  waitingForChoice = false;

  chosenCount = 0;

  chosenId: string = "";

  chosenSection: string | undefined = undefined;

  onTick?: (deltaMS: number) => void;

  override onExecute(
    game: G,
    data: DisplayCommandData,
    context: CommandContext<G>
  ): number[] {
    const blockId = data.reference.parentId;
    const commandId = data.reference.id;
    this.wasPressed = false;
    this.wasTyped = false;
    this.timeTypedMS = -1;
    this.elapsedMS = 0;
    this.down = game.input.state.pointer.down.includes(0);
    this.waitingForChoice = data?.params?.content?.some(
      (p) => p.tag === "choice"
    );
    this.onTick = executeDisplayCommand(
      game,
      data,
      context,
      () => {
        this.wasTyped = true;
      },
      (chosenSection, optionId) => {
        [this.chosenCount, this.chosenId] = game.logic.chooseChoice(
          blockId,
          commandId,
          optionId,
          data.source
        );
        this.chosenSection = chosenSection || "";
      }
    );
    return super.onExecute(game, data, context);
  }

  override onUpdate(_game: G, deltaMS: number): void {
    if (this.onTick) {
      this.onTick(deltaMS);
      this.elapsedMS += deltaMS;
    }
  }

  override onDestroy(_game: G): void {
    this.onTick = undefined;
  }

  override isFinished(
    game: G,
    data: DisplayCommandData,
    context: CommandContext<G>
  ): boolean {
    const { autoAdvance } = data.params;
    const prevDown = this.down;
    this.down = game.input.state.pointer.down.includes(0);
    const blockState = game.logic.state.blockStates[data.reference.parentId];
    if (!blockState) {
      return false;
    }
    if (this.wasTyped && this.timeTypedMS < 0) {
      this.timeTypedMS = this.elapsedMS;
    }
    const timeMSSinceTyped = this.elapsedMS - this.timeTypedMS;
    if (
      !this.waitingForChoice &&
      autoAdvance &&
      this.wasTyped &&
      timeMSSinceTyped / 1000 >= this.autoDelay
    ) {
      return true;
    }
    if (!prevDown && this.down) {
      this.wasPressed = true;
    }
    if (this.wasPressed) {
      this.wasPressed = false;
      if (this.wasTyped) {
        this.wasTyped = false;
        if (!this.waitingForChoice) {
          return true;
        }
      }
      let msAfterStopped = 0;
      this.onTick = (deltaMS: number) => {
        // Wait until typing sound has had enough time to fade out
        // So that it doesn't crackle when cut short
        msAfterStopped += deltaMS;
        const elapsed = msAfterStopped / 1000;
        if (elapsed > 0.03) {
          this.wasTyped = true;
        }
      };
      executeDisplayCommand(game, data, {
        ...context,
        instant: true,
      });
    }
    if (this.waitingForChoice && this.chosenSection != null) {
      const blockId = data.reference.parentId;

      const chosenSection = this.chosenSection;
      this.chosenSection = undefined;

      if (chosenSection === "") {
        return true;
      }

      // Seed is determined by how many times the choice has been chosen,
      // (instead of how many times the choice has been seen)
      const selectedBlock = game.logic.format(chosenSection, {
        $value: this.chosenCount - 1,
        $seed: this.chosenId,
      });
      const blocks = game.logic.config.blockMap;
      const id = getRelativeSectionName(blockId, blocks, selectedBlock);

      if (id == null) {
        return false;
      }

      const executedByBlockId = data.reference.parentId;

      const parentId = data?.reference?.parentId;
      game.logic.stopBlock(parentId);
      game.logic.enterBlock(id, false, executedByBlockId);
    }
    return false;
  }

  override onPreview(
    game: G,
    data: DisplayCommandData,
    context: CommandContext<G>
  ): boolean {
    executeDisplayCommand(game, data, { ...context, preview: true });
    return true;
  }
}
