import {
  evaluate,
  format,
} from "../../../../../../../../../spark-evaluate/src";
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

  calls?: Record<string, { name: string; values: string[] }>;

  override init(game: G): void {
    executeChoiceCommand(game);
  }

  override onExecute(
    game: G,
    data: ChoiceCommandData,
    context: CommandContext<G>
  ): number[] {
    const { value, calls, operator } = data.params;

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
      this.calls = calls;
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

      const executedByBlockId = data.reference.parentId;
      const latestValues = values?.map((v) => evaluate(v, valueMap));

      parameters?.forEach((parameterName, index) => {
        const parameterId = ids[parameterName];
        if (parameterId) {
          game.logic.setVariableValue(
            parameterId,
            latestValues?.[index],
            data.source
          );
        }
      });

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
      objectMap: { [type: string]: Record<string, any> };
    }
  ): boolean {
    executeChoiceCommand(game, data, context);
    return true;
  }
}
