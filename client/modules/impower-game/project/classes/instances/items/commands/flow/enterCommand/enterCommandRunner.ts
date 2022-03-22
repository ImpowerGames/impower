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

    const executedByBlockId = data.reference.parentContainerId;
    const parentId = game.logic.blockTree[executedByBlockId].parent;
    const siblingIds = game.logic.blockTree[parentId].children;

    let blockId = "";
    if (name === "") {
      blockId = game.logic.getNextBlockId(executedByBlockId);
    } else if (name?.toLowerCase() === "!quit") {
      return null;
    } else if (name === "[") {
      blockId = siblingIds.find(
        (x) => game.logic.blockTree[x].type === "section"
      );
    } else if (name === "]") {
      blockId = [...siblingIds]
        ?.reverse()
        .find((x) => game.logic.blockTree[x].type === "section");
    } else if (name === "^") {
      blockId = parentId;
    } else {
      blockId = ids?.[name];
    }

    if (!blockId) {
      return super.onExecute(data, context, game);
    }

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
