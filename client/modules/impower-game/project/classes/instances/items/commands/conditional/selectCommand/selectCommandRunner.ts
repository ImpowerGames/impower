import {
  CommandData,
  IterationMode,
  SelectCommandData,
  VariableValue,
} from "../../../../../../../data";
import { ImpowerGame } from "../../../../../../../game";
import { CommandRunner } from "../../../command/commandRunner";

export class SelectCommandRunner extends CommandRunner<SelectCommandData> {
  opensGroup(): boolean {
    return true;
  }

  onExecute(
    data: SelectCommandData,
    variables: { [id: string]: VariableValue },
    game: ImpowerGame,
    index: number,
    blockCommands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[]
  ): number[] {
    const { mode, randomized } = data;

    // Gather list of valid jump points
    const currentLevel = blockCommands[index].level;
    let validJumpIndices: number[] = [];
    const startIndex = index + 1;

    if (startIndex >= blockCommands.length) {
      return super.onExecute(data, variables, game, index, blockCommands);
    }

    let closeIndex;
    for (let i = startIndex; i < blockCommands.length; i += 1) {
      const c = blockCommands[i];
      if (c.level < currentLevel + 1) {
        closeIndex = i;
        break;
      }
      if (c.level === currentLevel + 1) {
        validJumpIndices.push(i);
      }
    }

    const blockState =
      game.logic.state.blockStates[data.reference.parentContainerId];

    const executionCount = blockState.commandExecutionCounts[index];
    const numElements = validJumpIndices.length;

    const iterationIndex = executionCount % numElements;
    const loopIndex = Math.floor(executionCount / numElements);

    if (randomized) {
      // We seed the "random" order for the select command's children so that
      // each child command is selected only once per loop
      game.random.reseed(loopIndex + data.reference.refId);
      if (mode === IterationMode.Stopping) {
        // Shuffle all possible jump indices except last
        const last = validJumpIndices.pop();
        validJumpIndices = game.random.shuffle(validJumpIndices);
        if (last) {
          validJumpIndices.push(last);
        }
      } else {
        // Shuffle all possible jump indices
        validJumpIndices = game.random.shuffle(validJumpIndices);
      }
      game.random.reset();
    }

    const nextIndex = validJumpIndices[iterationIndex];
    const lastIndex = validJumpIndices[validJumpIndices.length - 1];

    let jumpIndex: number | undefined;

    switch (mode) {
      case IterationMode.Cycle: {
        jumpIndex = nextIndex;
        break;
      }
      case IterationMode.Stopping: {
        jumpIndex = loopIndex < 1 ? nextIndex : lastIndex;
        break;
      }
      case IterationMode.Once: {
        jumpIndex = loopIndex < 1 ? nextIndex : undefined;
        break;
      }
      default:
        jumpIndex = undefined;
    }

    const jumpStack: number[] = [];

    if (jumpIndex !== undefined && jumpIndex < blockCommands.length) {
      jumpStack.push(jumpIndex);
    }
    if (closeIndex !== undefined) {
      jumpStack.push(closeIndex);
    } else {
      jumpStack.push(blockCommands.length);
    }

    return jumpStack;
  }
}
