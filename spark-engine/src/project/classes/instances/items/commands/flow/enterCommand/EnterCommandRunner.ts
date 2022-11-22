import { evaluate, format } from "../../../../../../../../../spark-evaluate";
import { EnterCommandData } from "../../../../../../../data";
import { SparkGame } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class EnterCommandRunner extends CommandRunner<EnterCommandData> {
  id?: string | null;

  override onExecute(
    game: SparkGame,
    data: EnterCommandData,
    context: CommandContext
  ): number[] {
    const { value, calls, returnWhenFinished } = data;
    const { ids, valueMap, parameters } = context;

    if (!value) {
      return super.onExecute(game, data, context);
    }

    let id: string | undefined = "#";
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
      return super.onExecute(game, data, context);
    }

    const parentId = data.reference.parentContainerId;
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

    game.logic.stopBlock(parentId);
    game.logic.enterBlock(id, returnWhenFinished, parentId);

    return super.onExecute(game, data, context);
  }

  override isFinished(
    game: SparkGame,
    data: EnterCommandData,
    context: CommandContext
  ): boolean | null {
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
      if (blockState && !blockState.hasFinished) {
        return false;
      }
      this.id = null;
      return super.isFinished(game, data, context);
    }
    return false;
  }
}
