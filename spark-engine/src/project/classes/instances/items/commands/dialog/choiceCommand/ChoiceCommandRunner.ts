import { evaluate, format } from "../../../../../../../../../spark-evaluate";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";
import { ChoiceCommandData } from "./ChoiceCommandData";
import { executeChoiceCommand } from "./executeChoiceCommand";

export class ChoiceCommandRunner extends CommandRunner<ChoiceCommandData> {
  choiceIndex: number = 0;

  seed?: string;

  chosenCount: number = 0;

  value?: string;

  calls?: Record<string, { name: string; values: string[] }>;

  override init(game: SparkGame): void {
    executeChoiceCommand(game);
  }

  override onExecute(
    game: SparkGame,
    data: ChoiceCommandData,
    context: CommandContext
  ): number[] {
    const { value, calls, operator } = data;
    const { index } = context;

    this.value = undefined;
    this.calls = undefined;

    if (operator === "start") {
      this.choiceIndex = 0;
      return super.onExecute(game, data, context);
    }

    if (operator === "end") {
      executeChoiceCommand(game, data, context, this.choiceIndex);
      return super.onExecute(game, data, context);
    }

    const from = data?.from;
    const line = data?.line;
    const blockId = data.reference.parentContainerId;
    const commandId = data.reference.refId;
    const commandIndex = index;

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
        commandIndex,
        from,
        line
      );
      this.value = value || "";
      this.calls = calls;
    });

    this.choiceIndex += 1;

    return super.onExecute(game, data, context);
  }

  override isFinished(
    game: SparkGame,
    data: ChoiceCommandData,
    context: CommandContext
  ): boolean | null {
    const { operator } = data;
    if (operator !== "end") {
      return true;
    }
    if (this.value != null) {
      const { ids, valueMap, parameters } = context;

      const value = this?.value;
      const calls = this?.calls;
      this.value = undefined;
      this.calls = undefined;

      if (value === "") {
        return true;
      }

      valueMap["#"] = [this.chosenCount - 1, this.seed];

      let id: string | undefined = "#";
      let values: string[] = [];

      const constantCall = calls?.[""];
      if (constantCall) {
        if (constantCall.name) {
          id = ids?.[constantCall.name];
          if (id == null) {
            id = constantCall.name;
          }
          values = constantCall.values;
        }
      } else {
        const [sectionExpression] = format(value || "", valueMap);
        const dynamicCall = calls?.[sectionExpression];
        if (dynamicCall?.name) {
          id = ids?.[dynamicCall.name];
          if (id == null) {
            id = dynamicCall.name;
          }
          values = dynamicCall.values;
        }
      }

      if (id === "#") {
        return true;
      }

      if (id === "!") {
        return null;
      }

      const executedByBlockId = data.reference.parentContainerId;
      const latestValues = values?.map((v) => evaluate(v, valueMap));

      parameters?.forEach((parameterName, index) => {
        const parameterId = ids[parameterName];
        if (parameterId) {
          game.logic.setVariableValue(
            parameterId,
            latestValues?.[index],
            data.from,
            data.line
          );
        }
      });

      const parentId = data?.reference?.parentContainerId;
      game.logic.stopBlock(parentId);
      game.logic.enterBlock(id, false, executedByBlockId);
    }
    return false;
  }

  override onPreview(
    game: SparkGame,
    data: ChoiceCommandData,
    context: {
      valueMap: Record<string, unknown>;
      objectMap: Record<string, Record<string, unknown>>;
    }
  ): boolean {
    executeChoiceCommand(game, data, context);
    return true;
  }
}
