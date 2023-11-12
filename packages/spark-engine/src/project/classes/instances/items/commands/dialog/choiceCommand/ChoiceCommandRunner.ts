import { format } from "../../../../../../../../../spark-evaluate/src";
import getRelativeSectionName from "../../../../../../../../../sparkdown/src/utils/getRelativeSectionName";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";
import { ChoiceCommandData } from "./ChoiceCommandData";
import { executeChoiceCommand } from "./executeChoiceCommand";

export class ChoiceCommandRunner<G extends SparkGame> extends CommandRunner<
  G,
  ChoiceCommandData
> {
  choiceIndex: number = 0;

  seed?: string;

  chosenCount: number = 0;

  value?: string;

  override init(game: G): void {
    executeChoiceCommand(game);
  }

  override onExecute(
    game: G,
    data: ChoiceCommandData,
    context: CommandContext<G>
  ): number[] {
    const { value, operator } = data.params;

    this.value = undefined;

    if (operator === "start") {
      this.choiceIndex = 0;
      return super.onExecute(game, data, context);
    }

    if (operator === "end") {
      executeChoiceCommand(game, data, context, this.choiceIndex);
      return super.onExecute(game, data, context);
    }

    const blockId = data.reference.parentId;
    const commandId = data.reference.id;

    const blockState = game?.logic?.state?.blockStates?.[blockId];
    const currentCount = blockState?.choiceChosenCounts?.[commandId] || 0;

    if (operator === "-" && currentCount > 0) {
      return super.onExecute(game, data, context);
    }

    executeChoiceCommand(game, data, context, this.choiceIndex, () => {
      this.seed = game.random.state.seed + commandId;
      this.chosenCount = game.logic.chooseChoice(
        blockId,
        commandId,
        data.source
      );
      this.value = value || "";
    });

    this.choiceIndex += 1;

    return super.onExecute(game, data, context);
  }

  override isFinished(
    game: G,
    data: ChoiceCommandData,
    context: CommandContext<G>
  ): boolean | null {
    const { operator } = data;
    const blockId = data.reference.parentId;

    if (operator !== "end") {
      return true;
    }
    if (this.value != null) {
      const { ids, valueMap } = context;

      const value = this?.value;
      this.value = undefined;

      if (value === "") {
        return true;
      }

      valueMap["#"] = [this.chosenCount - 1, this.seed];

      const [selectedBlock] = format(value, valueMap);
      const blocks = game.logic.config.blockMap;
      const blockName = getRelativeSectionName(blockId, blocks, selectedBlock);
      const id = ids?.[blockName];

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
    data: ChoiceCommandData,
    context: {
      valueMap: Record<string, unknown>;
      typeMap: { [type: string]: Record<string, any> };
    }
  ): boolean {
    executeChoiceCommand(game, data, context);
    return true;
  }
}
