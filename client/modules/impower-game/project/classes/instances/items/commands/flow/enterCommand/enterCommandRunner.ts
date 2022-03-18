import { evaluate } from "../../../../../../../../impower-evaluate";
import { EnterCommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class EnterCommandRunner extends CommandRunner<EnterCommandData> {
  onExecute(
    data: EnterCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { name, values, returnWhenFinished } = data;
    const { ids, valueMap, parameters } = context;

    const blockId = ids[name];
    if (!blockId) {
      return super.onExecute(data, context, game);
    }

    const executedByBlockId = data.reference.parentContainerId;
    const latestValues = values?.map((v) => evaluate(valueMap, v));

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
      returnWhenFinished,
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: EnterCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
    const { name } = data;
    const { ids } = context;

    const blockId = ids[name];
    if (!blockId) {
      return super.isFinished(data, context, game);
    }

    const blockState = game.logic.state.blockStates[blockId];
    if (!blockState.hasFinished) {
      return false;
    }

    return super.isFinished(data, context, game);
  }
}
