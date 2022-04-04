import { evaluate, format } from "../../../../../../../../impower-evaluate";
import { EnterCommandData } from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/commandRunner";

export class EnterCommandRunner extends CommandRunner<EnterCommandData> {
  id: string;

  onExecute(
    data: EnterCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): number[] {
    const { value, calls, returnWhenFinished } = data;
    const { ids, valueMap, parameters } = context;

    if (!value) {
      return super.onExecute(data, context, game);
    }

    let id = "#";
    let values: string[] = [];

    const constantCall = calls[""];
    if (constantCall) {
      if (constantCall?.name) {
        id = ids?.[constantCall.name];
        if (id == null) {
          id = constantCall.name;
        }
        values = constantCall.values;
      }
    } else {
      const [sectionExpression] = format(value, valueMap);
      const dynamicCall = calls[sectionExpression];
      if (dynamicCall?.name) {
        id = ids?.[dynamicCall.name];
        if (id == null) {
          id = dynamicCall.name;
        }
        values = dynamicCall.values;
      }
    }

    this.id = id;

    if (id == null) {
      return super.onExecute(data, context, game);
    }

    const parentId = data.reference.parentContainerId;
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

    game.logic.stopBlock({ id: parentId });
    game.logic.enterBlock({
      id,
      executedByBlockId: parentId,
      returnWhenFinished,
    });

    return super.onExecute(data, context, game);
  }

  isFinished(
    data: EnterCommandData,
    context: CommandContext,
    game: ImpowerGame
  ): boolean {
    const { returnWhenFinished } = data;
    if (this.id === "#") {
      this.id = null;
      return true;
    }
    if (this.id === "!") {
      this.id = null;
      return null;
    }
    if (this.id != null && returnWhenFinished) {
      const blockState = game.logic.state.blockStates[this.id];
      if (!blockState.hasFinished) {
        return false;
      }
      this.id = null;
      return super.isFinished(data, context, game);
    }
    return false;
  }
}
