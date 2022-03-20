import { evaluate } from "../../../../../../../../impower-evaluate";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";
import { ChoiceCommandData } from "./choiceCommandData";
import { executeChoiceCommand } from "./executeChoiceCommand";

export class ChoiceCommandRunner extends CommandRunner<ChoiceCommandData> {
  name: string;

  values: string[];

  onExecute(
    data: ChoiceCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { index, name, values } = data;
    if (index === 0) {
      this.name = null;
    }
    executeChoiceCommand(data, () => {
      this.name = name;
      this.values = values;
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: ChoiceCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
    if (this.name) {
      const { ids, valueMap, parameters } = context;

      if (!this.name) {
        return super.isFinished(data, context, game);
      }

      const blockId = ids[this.name];
      const executedByBlockId = data.reference.parentContainerId;
      const latestValues = this.values?.map((v) => evaluate(valueMap, v));

      this.name = null;
      this.values = null;

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
        id: blockId,
        executedByBlockId,
        returnWhenFinished: false,
      });
    }
    return false;
  }
}
