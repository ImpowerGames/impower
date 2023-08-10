import { BlockData, CommandData } from "../../../../../data";
import { Game } from "../../../../../game";
import { ContainerRunner } from "../../container/ContainerRunner";
import { CommandRunner } from "../../items/command/CommandRunner";

export interface BlockContext<G extends Game> {
  ids: Record<string, string>;
  valueMap: Record<string, unknown>;
  objectMap: { [type: string]: Record<string, any> };
  triggers: string[];
  parameters: string[];
  commands: {
    runner: CommandRunner<G>;
    data: CommandData;
  }[];
  debug?: boolean;
}

export class BlockRunner<G extends Game> extends ContainerRunner<G, BlockData> {
  /**
   * This method is called once per game step while the scene is running.
   * @param time The current time. Either a High Resolution Timer value if it comes from Request Animation Frame, or Date.now if using SetTimeout.
   * @param deltaMS The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
   *
   * @return {boolean} True, if still executing. False, if finished, Null, if quit.
   */
  update(blockId: string, context: BlockContext<G>, game: G): boolean | null {
    const { triggers, valueMap } = context;

    game.logic.updateBlock(blockId);

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

      game.logic.checkTriggers(blockId, satisfiedTriggers, unsatisfiedTriggers);

      if (shouldExecute) {
        const block = game.logic.config.blockMap[blockId];
        if (block) {
          game.logic.executeBlock(blockId, block.parent || "");
        }
      }
    }

    if (blockState.isExecuting) {
      const running = this.runCommands(blockId, context, game);
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
    context: BlockContext<G>,
    game: G
  ): boolean | null {
    const commands = context?.commands;
    const blockState = game.logic.state.blockStates[blockId];
    if (!blockState) {
      return false;
    }
    while (blockState.executingIndex < commands.length) {
      const command = commands[blockState.executingIndex];
      if (command) {
        const commandId = command.data.reference.id;
        const commandIndex = blockState.executingIndex;
        const executionCount = blockState.commandExecutionCounts[commandId];
        const source = command?.data?.source;
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
        if (!blockState.isExecutingCommand) {
          game.logic.executeCommand(blockId, commandId, source);
          let nextJumps: number[] = [];
          if (!fastForward) {
            nextJumps = command.runner.onExecute(game, command.data, {
              ...context,
              index: blockState.executingIndex,
            });
          }
          if (nextJumps.length > 0) {
            game.logic.commandJumpStackPush(blockId, nextJumps, source);
          }
          if (!blockState.isExecutingCommand) {
            return true;
          }
        }
        if (!fastForward && command.data.params.waitUntilFinished) {
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
        game.logic.finishCommand(blockId, commandId, commandIndex, source);
        if (blockState.commandJumpStack.length > 0) {
          const nextCommandIndex = game.logic.commandJumpStackPop(
            blockId,
            source
          );
          if (nextCommandIndex !== undefined) {
            game.logic.goToCommandIndex(blockId, nextCommandIndex, source);
          }
        } else {
          const nextCommandIndex = blockState.executingIndex + 1;
          game.logic.goToCommandIndex(blockId, nextCommandIndex, source);
        }
      }
    }
    return false;
  }
}
