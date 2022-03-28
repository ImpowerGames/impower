import { evaluate, format } from "../../../../../../../../impower-evaluate";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { ChoiceCommandData } from "./choiceCommandData";
import { executeChoiceCommand } from "./executeChoiceCommand";

export class ChoiceCommandRunner extends CommandRunner<ChoiceCommandData> {
  choiceIndex: number;

  seed: string;

  chosenCount: number;

  value: string;

  calls: Record<string, { name: string; values: string[] }>;

  init(): void {
    executeChoiceCommand();
  }

  onExecute(
    data: ChoiceCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { value, calls, operator } = data;
    const { index } = context;

    if (operator === "start") {
      this.choiceIndex = 0;
      this.value = null;
      this.calls = null;
      return super.onExecute(data, context, game);
    }

    if (operator === "end") {
      executeChoiceCommand(data, context, undefined, this.choiceIndex);
      return super.onExecute(data, context, game);
    }

    const pos = data?.pos;
    const line = data?.line;
    const blockId = data.reference.parentContainerId;
    const commandId = data.reference.refId;
    const commandIndex = index;

    const blockState = game?.logic?.state?.blockStates?.[blockId];
    const currentCount = blockState?.choiceChosenCounts?.[commandId] || 0;

    if (operator === "-" && currentCount > 0) {
      return super.onExecute(data, context, game);
    }

    executeChoiceCommand(data, context, this.choiceIndex, undefined, () => {
      this.seed = game.random.state.seed + commandId;
      this.chosenCount = game.logic.chooseChoice({
        pos,
        line,
        blockId,
        commandId,
        commandIndex,
      });
      this.value = value || "";
      this.calls = calls;
    });

    this.choiceIndex += 1;

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: ChoiceCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
    if (this.value != null) {
      const { ids, valueMap, parameters } = context;

      const value = this?.value;
      const calls = this?.calls;
      this.value = null;
      this.calls = null;

      if (value === "") {
        return true;
      }

      valueMap["#"] = [this.chosenCount - 1, this.seed];

      let id = "#";
      let values: string[] = [];

      const constantCall = calls[""];
      if (constantCall) {
        id = ids?.[constantCall.name];
        if (id == null) {
          id = constantCall.name;
        }
        values = constantCall.values;
      } else {
        const [sectionExpression] = format(value, valueMap);
        const dynamicCall = calls[sectionExpression];
        id = ids?.[dynamicCall.name];
        if (id == null) {
          id = dynamicCall.name;
        }
        values = dynamicCall.values;
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
          game.logic.setVariableValue({
            pos: data.pos,
            line: data.line,
            id: parameterId,
            value: latestValues?.[index],
          });
        }
      });

      game.logic.enterBlock({
        id,
        executedByBlockId,
        returnWhenFinished: false,
      });
    }
    return false;
  }
}
