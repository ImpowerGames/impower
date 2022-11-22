import { BlockData, CommandData } from "../../../../../data";
import { SparkGame } from "../../../../../game";
import { ContainerRunner } from "../../container/ContainerRunner";
import { CommandRunner } from "../../items/command/CommandRunner";

export interface BlockContext {
  ids: Record<string, string>;
  valueMap: Record<string, unknown>;
  objectMap: { [type: string]: Record<string, unknown> };
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
    blockId: string,
    context: BlockContext,
    game: SparkGame,
    time: number,
    delta: number
  ): boolean | null {
    const { triggers, valueMap } = context;

    game.logic.updateBlock(blockId, time, delta);

    const blockState = game.logic.state.blockStates[blockId];
    if (!blockState) {
      return false;
    }

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

      game.logic.checkTriggers(
        blockId,
        shouldExecute,
        satisfiedTriggers,
        unsatisfiedTriggers
      );

      if (shouldExecute) {
        const block = game.logic.config.blockMap[blockId];
        if (block) {
          game.logic.executeBlock(blockId, block.parent || "");
        }
      }
    }

    if (blockState.isExecuting) {
      const running = this.runCommands(blockId, context, game, time);
      if (running === null) {
        return null;
      }
      if (running === false) {
        game.logic.finishBlock(blockId);
        game.logic.continue(blockId);
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
    blockId: string,
    context: BlockContext,
    game: SparkGame,
    time: number
  ): boolean | null {
    const commands = context?.commands;
    const blockState = game.logic.state.blockStates[blockId];
    if (!blockState) {
      return false;
    }
    while (blockState.executingIndex < commands.length) {
      const command = commands[blockState.executingIndex];
      if (command) {
        const commandId = command.data.reference.refId;
        const commandIndex = blockState.executingIndex;
        const executionCount = blockState.commandExecutionCounts[commandId];
        const from = command?.data?.from;
        const line = command?.data?.line;
        const fastForward = blockState.startIndex > blockState.executingIndex;
        const changedVariables = game?.logic?.state?.changedVariables;
        const changedBlocks = game?.logic?.state?.changedBlocks;
        const variableStates = game?.logic?.state?.variableStates;
        const blockStates = game?.logic?.state?.blockStates;
        changedVariables.forEach((id) => {
          const state = variableStates[id];
          if (state) {
            context.valueMap[state.name] = state.value;
          }
        });
        changedBlocks.forEach((id) => {
          const state = blockStates[id];
          if (state) {
            context.valueMap[state.name] = state.executionCount;
          }
        });
        context.valueMap["#"] = [
          executionCount,
          game.random.state.seed + commandId,
        ];
        context.debug = game?.debug?.state?.debugging;
        if (blockState.lastExecutedAt < 0) {
          game.logic.executeCommand(
            blockId,
            commandId,
            commandIndex,
            time,
            from,
            line
          );
          let nextJumps: number[] = [];
          if (!fastForward) {
            nextJumps = command.runner.onExecute(game, command.data, {
              ...context,
              index: blockState.executingIndex,
            });
          }
          if (nextJumps.length > 0) {
            game.logic.commandJumpStackPush(blockId, nextJumps, from, line);
          }
          if (blockState.lastExecutedAt < 0) {
            return true;
          }
        }
        if (!fastForward && command.data.waitUntilFinished) {
          const finished = command.runner.isFinished(game, command.data, {
            ...context,
            index: blockState.executingIndex,
          });
          if (finished === null) {
            return null;
          }
          if (!finished) {
            return true;
          }
        }
        command.runner.onFinished(game, command.data, {
          ...context,
          index: blockState.executingIndex,
        });
        game.logic.finishCommand(
          blockId,
          commandId,
          commandIndex,
          time,
          from,
          line
        );
        if (blockState.commandJumpStack.length > 0) {
          const nextCommandIndex = game.logic.commandJumpStackPop(
            blockId,
            from,
            line
          );
          if (nextCommandIndex !== undefined) {
            game.logic.goToCommandIndex(blockId, nextCommandIndex, from, line);
          }
        } else {
          const nextCommandIndex = blockState.executingIndex + 1;
          game.logic.goToCommandIndex(blockId, nextCommandIndex, from, line);
        }
      }
    }
    return false;
  }
}
