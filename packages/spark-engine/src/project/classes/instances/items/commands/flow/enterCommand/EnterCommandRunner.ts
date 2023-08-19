import {
  evaluate,
  format,
} from "../../../../../../../../../spark-evaluate/src";
import { EnterCommandData } from "../../../../../../../data";
import { Game } from "../../../../../../../game";
import { CommandContext, CommandRunner } from "../../../command/CommandRunner";

export class EnterCommandRunner<G extends Game> extends CommandRunner<
  G,
  EnterCommandData
> {
  id?: string | null;

  override onExecute(
    game: G,
    data: EnterCommandData,
    context: CommandContext<G>
  ): number[] {
    const { value, calls, returnWhenFinished } = data.params;
    const { ids, valueMap, parameters } = context;

    if (!value) {
      return super.onExecute(game, data, context);
    }

    let id: string | undefined = "#";
    let args: string[] = [];

    const constantCall = calls[""];
    if (constantCall) {
      if (constantCall?.name) {
        id = ids?.[constantCall.name];
        if (id == null) {
          id = constantCall.name;
        }
        args = constantCall.args;
      }
    } else {
      const [sectionExpression] = format(value, valueMap);
      const dynamicCall = calls[sectionExpression];
      if (dynamicCall?.name) {
        id = ids?.[dynamicCall.name];
        if (id == null) {
          id = dynamicCall.name;
        }
        args = dynamicCall.args;
      }
    }

    this.id = id;

    if (id == null) {
      return super.onExecute(game, data, context);
    }

    const parentId = data.reference.parentId;
    const latestArgs = args?.map((v) => evaluate(v, valueMap));

    parameters?.forEach((parameterName, index) => {
      const parameterId = ids[parameterName];
      if (parameterId) {
        game.logic.setVariableValue(
          parameterId,
          latestArgs?.[index],
          data.source
        );
      }
    });

    game.logic.stopBlock(parentId);
    game.logic.enterBlock(id, returnWhenFinished, parentId);

    return super.onExecute(game, data, context);
  }

  override isFinished(
    game: G,
    data: EnterCommandData,
    context: CommandContext<G>
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
