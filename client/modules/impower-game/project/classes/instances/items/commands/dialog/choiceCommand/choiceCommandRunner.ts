import { evaluate, format } from "../../../../../../../../impower-evaluate";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { ChoiceCommandData } from "./choiceCommandData";
import { executeChoiceCommand } from "./executeChoiceCommand";

export class ChoiceCommandRunner extends CommandRunner<ChoiceCommandData> {
  value: string;

  calls: Record<string, { name: string; values: string[] }>;

  onExecute(
    data: ChoiceCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { index, value, calls } = data;

    if (index === 0) {
      this.value = null;
      this.calls = null;
    }

    executeChoiceCommand(data, context, () => {
      this.value = value || "";
      this.calls = calls;
    });

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

      let id = "#";
      let values: string[] = [];

      const constantCall = calls[""];
      if (constantCall) {
        if (constantCall?.name === "!") {
          id = constantCall.name;
        } else if (constantCall?.name) {
          id = ids?.[constantCall.name];
          values = constantCall.values;
        }
      } else {
        const [sectionExpression] = format(value, valueMap);
        const dynamicCall = calls[sectionExpression];
        if (dynamicCall?.name === "!") {
          id = dynamicCall.name;
        } else if (dynamicCall?.name) {
          id = ids?.[dynamicCall.name];
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
