import { BlockData, CommandData } from "../../../../../data";
import { BlockState, SparkGame } from "../../../../../game";
import { ContainerRunner } from "../../container/ContainerRunner";
import { CommandRunner } from "../../items/command/CommandRunner";

export interface BlockContext {
  ids: Record<string, string>;
  valueMap: Record<string, unknown>;
  objectMap: Record<string, Record<string, unknown>>;
  triggers: string[];
  parameters: string[];
  commands: {
    runner: CommandRunner;
    data: CommandData;
  }[];
  debug?: boolean;
}

export class BlockRunner extends ContainerRunner<BlockData> {
  /**
   * This method is called once per game step while the scene is running.
   * @param time The current time. Either a High Resolution Timer value if it comes from Request Animation Frame, or Date.now if using SetTimeout.
   * @param delta The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
   *
   * @return {boolean} True, if still executing. False, if finished, Null, if quit.
   */
  update(
    id: string,
    blockState: BlockState,
    context: BlockContext,
    game: SparkGame,
    time: number,
    delta: number
  ): boolean | null {
    const { triggers, valueMap } = context;

    game.logic.updateBlock({ id, time, delta });

    if (!blockState.isExecuting) {
      const satisfiedTriggers: string[] = [];
      const unsatisfiedTriggers: string[] = [];
      triggers.forEach((variableName) => {
        const value = valueMap[variableName];
        if (value) {
          satisfiedTriggers.push(variableName);
        } else {
          unsatisfiedTriggers.push(variableName);
        }
      });

      const shouldExecute = satisfiedTriggers?.length > 0;

      game.logic.checkTriggers({
        blockId: id,
        shouldExecute,
        satisfiedTriggers,
        unsatisfiedTriggers,
      });

      if (shouldExecute) {
        game.logic.executeBlock({
          id,
          executedByBlockId: game.logic.blockMap[id].parent,
        });
      }
    }

    if (blockState.isExecuting) {
      const running = this.runCommands(id, blockState, context, game, time);
      if (running === null) {
        return null;
      }
      if (running === false) {
        game.logic.finishBlock({ id });
        game.logic.continue({ id });
        return false;
      }
    }

    return true;
  }

  /**
   * Iterates over commands and executes each one in sequence.
   *
   * @return {boolean} True, if still executing. False, if the block is finished executing and there are no more commands left to execute, Null, if quit.
   */
  private runCommands(
    id: string,
    blockState: BlockState,
    context: BlockContext,
    game: SparkGame,
    time: number
  ): boolean | null {
    const commands = context?.commands;
    const blockId = id;
    while (blockState.executingIndex < commands.length) {
      const command = commands[blockState.executingIndex];
      const commandId = command.data.reference.refId;
      const commandIndex = blockState.executingIndex;
      const executionCount = blockState.commandExecutionCounts[commandId];
      const from = command?.data?.from;
      const line = command?.data?.line;
      const fastForward = blockState.startIndex > blockState.executingIndex;
      const variableStates = game?.logic?.state?.variableStates;
      const blockStates = game?.logic?.state?.blockStates;
      Object.entries(variableStates).forEach(([id, state]) => {
        const name = id.split(".").slice(-1).join("");
        context.valueMap[name] = state.value;
      });
      Object.entries(blockStates).forEach(([id, state]) => {
        const name = id.split(".").slice(-1).join("");
        context.valueMap[name] = state.executionCount;
      });
      context.valueMap["#"] = [
        executionCount,
        game.random.state.seed + commandId,
      ];
      context.debug = game?.debug?.state?.debugging;
      if (blockState.lastExecutedAt < 0) {
        game.logic.executeCommand({
          from,
          line,
          blockId,
          commandId,
          commandIndex,
          time,
        });
        let nextJumps: number[] = [];
        if (!fastForward) {
          nextJumps = command.runner.onExecute(
            command.data,
            { ...context, index: blockState.executingIndex },
            game
          );
        }
        if (nextJumps.length > 0) {
          game.logic.commandJumpStackPush({
            from,
            line,
            blockId,
            indices: nextJumps,
          });
        }
        if (blockState.lastExecutedAt < 0) {
          return true;
        }
      }
      if (!fastForward && command.data.waitUntilFinished) {
        const finished = command.runner.isFinished(
          command.data,
          { ...context, index: blockState.executingIndex },
          game
        );
        if (finished === null) {
          return null;
        }
        if (!finished) {
          return true;
        }
      }
      game.logic.finishCommand({
        from,
        line,
        blockId,
        commandId,
        commandIndex,
        time,
      });
      if (blockState.commandJumpStack.length > 0) {
        const nextCommandIndex = game.logic.commandJumpStackPop({
          from,
          line,
          blockId,
        });
        if (nextCommandIndex !== undefined) {
          game.logic.goToCommandIndex({
            from,
            line,
            blockId,
            index: nextCommandIndex,
          });
        }
      } else {
        const nextCommandIndex = blockState.executingIndex + 1;
        game.logic.goToCommandIndex({
          from,
          line,
          blockId,
          index: nextCommandIndex,
        });
      }
    }
    return false;
  }
}
