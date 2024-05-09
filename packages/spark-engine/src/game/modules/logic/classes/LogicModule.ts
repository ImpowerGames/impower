import type { Game } from "../../../core/classes/Game";
import { Module } from "../../../core/classes/Module";
import type { RecursiveReadonly } from "../../../core/types/RecursiveReadonly";
import { evaluate } from "../../../core/utils/evaluate";
import { format } from "../../../core/utils/format";
import { randomizer } from "../../../core/utils/randomizer";
import { shuffle } from "../../../core/utils/shuffle";
import { LogicBuiltins, logicBuiltins } from "../logicBuiltins";
import { logicCommands } from "../logicCommands";
import { BlockData } from "../types/BlockData";
import { BlockState } from "../types/BlockState";
import { CommandData } from "../types/CommandData";
import { DocumentSource } from "../types/DocumentSource";
import { FlowLocation } from "../types/FlowLocation";
import { ICommandRunner } from "../types/ICommandRunner";
import createBlockState from "../utils/createBlockState";
import getRelativeSectionName from "../utils/getRelativeSectionName";
import {
  DidExecuteMessage,
  DidExecuteMessageMap,
} from "./messages/DidExecuteMessage";
import {
  WillExecuteMessage,
  WillExecuteMessageMap,
} from "./messages/WillExecuteMessage";

export interface LogicConfig {
  waypoints?: string[];
  startpoint?: string;
  blockMap?: Record<string, BlockData>;
}

export interface LogicState {
  blocks?: Record<string, BlockState>;
  seed?: string;
  checkpoint?: string;
}

export type LogicMessageMap = DidExecuteMessageMap & WillExecuteMessageMap;

export class LogicModule extends Module<
  LogicState,
  LogicMessageMap,
  LogicBuiltins
> {
  FINISH_COMMAND_TYPE = "FinishCommand";

  DEFAULT_LOCATION = { blockId: "", commandIndex: 0, position: 0 };

  protected _blockMap: Record<string, BlockData> = {};
  get blockMap() {
    return this._blockMap;
  }

  protected _flowMap: Record<
    string,
    {
      isExecutingCommand?: boolean;
      previousCommandIndex: number;
      currentCommandIndex: number;
    }
  > = {};
  get flowMap() {
    return this._flowMap as RecursiveReadonly<typeof this._flowMap>;
  }

  protected _blockLocations: Record<string, FlowLocation> = {};
  get blockLocations() {
    return this._blockLocations as RecursiveReadonly<
      typeof this._blockLocations
    >;
  }

  // Command locations for this run
  protected _commandLocations: Record<string, FlowLocation> = {};
  get commandLocations() {
    return this._commandLocations as RecursiveReadonly<
      typeof this._commandLocations
    >;
  }

  // Visitation counts for this run
  protected _visited: Record<string, number> = {};
  get visited() {
    return this._visited as RecursiveReadonly<typeof this._visited>;
  }

  // Loaded block ids for this run
  protected _loaded: string[] = [];
  get loaded() {
    return this._loaded as RecursiveReadonly<typeof this._loaded>;
  }

  // Randomizer for this run
  protected _random: () => number;

  protected _runnerMap: Record<string, ICommandRunner> = {};
  get runnerMap() {
    return this._runnerMap as RecursiveReadonly<typeof this._runnerMap>;
  }

  protected _runners: ICommandRunner[] = [];

  protected _stopSimulatingAt?: FlowLocation;

  protected _simulationAwaitingChoice = false;

  protected _restoring = false;

  constructor(game: Game) {
    super(game);

    let position = 0;
    if (this.context?.config?.logic?.blockMap) {
      // Populate _blockMap
      this._blockMap = JSON.parse(
        JSON.stringify(this.context?.config?.logic?.blockMap || {})
      );
      Object.entries(this._blockMap).forEach(([blockId, block]) => {
        // We add a special FinishCommand as the last command of every block.
        // This allows flow changes to resume flow from the very end of a block.
        const lastSource = block.commands?.at(-1)?.source || block.source;
        block.commands ??= [];
        block.commands.push({
          type: this.FINISH_COMMAND_TYPE,
          parent: blockId,
          id: `${blockId}.finish`,
          index: block.commands.length,
          indent: 0,
          params: {},
          source: {
            file: lastSource?.file,
            line: lastSource?.line,
            from: lastSource?.to,
            to: lastSource?.to,
          },
        });
        // Populate _flowMap
        this._flowMap[blockId] = {
          isExecutingCommand: false,
          previousCommandIndex: -1,
          currentCommandIndex: 0,
        };
        this._blockLocations[blockId] = {
          blockId: blockId,
          commandIndex: 0,
          position,
        };
        position += 1;
        block.commands.forEach((command) => {
          // Populate _commandMap
          this._commandLocations[command.id] = {
            blockId: command.parent,
            commandIndex: command.index,
            position,
          };
          position += 1;
        });
      });
    }
    if (this._state.blocks) {
      // Restore _loaded
      Object.entries(this._state.blocks).forEach(([blockId, blockState]) => {
        if (blockState.isLoaded) {
          this._loaded.push(blockId);
        }
      });
    }
    if (game.context?.["visited"]) {
      // Restore _visited
      Object.entries(game.context["visited"]).forEach(([key, count]) => {
        if (typeof count === "number") {
          this._visited[key] = count;
        }
      });
    }
    // Restore _random
    this._random = randomizer(this._state.seed);
    // Restore checkpoint
    if (this._state.checkpoint) {
      const checkpointLocation = this.getLocation(this._state.checkpoint);
      if (checkpointLocation) {
        const flow = this._flowMap[checkpointLocation.blockId];
        if (flow) {
          flow.currentCommandIndex = checkpointLocation.commandIndex;
        }
      }
    }
  }

  override getBuiltins() {
    return logicBuiltins();
  }

  override getStored() {
    return ["visited"];
  }

  override getCommands() {
    return logicCommands(this._game);
  }

  override onStart() {
    this._runners.forEach((r) => {
      r.onInit();
    });
    const closestWaypointLocation = this.getClosestLocationBefore(
      this.context?.config?.logic?.startpoint || "",
      (this.context?.config?.logic?.waypoints as string[]) || []
    );
    const startLocation =
      this.getLocation(this.context?.config?.logic?.startpoint || "") ||
      this.DEFAULT_LOCATION;
    this._stopSimulatingAt = this.getClosestSavepoint(
      this.context?.config?.logic?.startpoint || ""
    );
    this.context.system.simulating =
      this.context?.config?.logic?.startpoint != null &&
      this._stopSimulatingAt != null &&
      closestWaypointLocation != null &&
      this._stopSimulatingAt.position > closestWaypointLocation.position;
    if (!this.state.checkpoint) {
      const entryLocation = this.context.system?.simulating
        ? closestWaypointLocation
        : startLocation;
      if (entryLocation) {
        this.enterBlock(entryLocation.blockId, entryLocation.commandIndex);
      }
    }
  }

  override onDestroy() {
    this._runners.forEach((r) => {
      r.onDestroy();
    });
  }

  registerRunners(runners: Record<string, ICommandRunner>) {
    this._runnerMap = { ...this._runnerMap, ...runners };
    this._runners = Object.values(this._runnerMap);
  }

  getRunner(command: CommandData) {
    return this._runnerMap[command.type];
  }

  private resetBlockExecution(blockId: string): void {
    const blockState = this._state.blocks?.[blockId] || createBlockState();
    delete blockState.isExecuting;
    delete blockState.isFinished;
    delete blockState.commandJumpStack;
    this._state.blocks ??= {};
    this._state.blocks[blockId] = blockState;
    const flow = this._flowMap[blockId];
    if (flow) {
      flow.isExecutingCommand = false;
      flow.previousCommandIndex = -1;
      flow.currentCommandIndex = 0;
    }
  }

  private loadBlock(blockId: string): void {
    const blockState = this._state.blocks?.[blockId] || createBlockState();
    this._state.blocks ??= {};
    this._state.blocks[blockId] = blockState;
    if (blockState.isLoaded) {
      return;
    }
    blockState.isLoaded = true;

    this._loaded.push(blockId);
  }

  private loadBlocks(blockIds: string[]): void {
    blockIds.map((blockId) => this.loadBlock(blockId));
  }

  private unloadBlock(blockId: string): void {
    const blockState = this._state.blocks?.[blockId];
    if (!blockState?.isLoaded) {
      return;
    }
    blockState.isLoaded = false;

    this._loaded = this._loaded.filter((id) => id !== blockId);
  }

  /**
   * Updates logic.
   *
   * @return {boolean} Null, if should reload. Otherwise, true
   */
  override onUpdate(deltaMS: number) {
    this._runners.forEach((r) => {
      r.onUpdate(deltaMS);
    });
    const loadedBlockIds = this._loaded;
    if (loadedBlockIds) {
      for (let i = 0; i < loadedBlockIds.length; i += 1) {
        const blockId = loadedBlockIds[i];
        if (blockId !== undefined) {
          if (this.updateBlock(blockId) === null) {
            return null;
          }
        }
      }
    }
    return true;
  }

  /**
   * Updates block.
   *
   * @return {boolean} True, if still executing. False, if the block is finished executing and there are no more commands left to execute, Null, if should reload.
   */
  updateBlock(blockId: string): boolean | null {
    const block = this._blockMap[blockId];
    if (!block) {
      return false;
    }

    const blockState = this._state.blocks?.[blockId];
    if (!blockState) {
      return false;
    }

    if (blockState.isLoaded && blockState.isExecuting) {
      const running = this.runCommands(blockId);
      if (running === null) {
        return running;
      }
      if (running === false) {
        this.finishBlock(blockId);
        this.continue(blockId);
        return running;
      }
      return running;
    }

    return false;
  }

  /**
   * Iterates over commands and executes each one in sequence.
   *
   * @return {boolean} True, if still executing. False, if the block is finished executing and there are no more commands left to execute, Null, if should reload.
   */
  protected runCommands(blockId: string): boolean | null {
    const commands = this._blockMap[blockId]?.commands;
    if (!commands) {
      return false;
    }
    const flow = this._flowMap[blockId];
    if (!flow) {
      return false;
    }
    const blockState = this._state.blocks?.[blockId];
    if (!blockState) {
      return false;
    }
    let synchronousExecutionCount = 0;
    while (
      flow.currentCommandIndex < commands.length &&
      synchronousExecutionCount < Number.MAX_SAFE_INTEGER
    ) {
      const commandIndex = flow.currentCommandIndex;
      const command = commands[commandIndex];
      if (command) {
        const runner = this.getRunner(command);
        if (runner) {
          const commandId = command.id;
          if (!flow.isExecutingCommand) {
            const isSavepoint =
              commandIndex === 0 || runner.isSavepoint(command);
            const isChoicepoint = runner.isChoicepoint(command);
            if (this.context.system?.simulating) {
              if (isChoicepoint) {
                // Must wait for user to make a choice
                this._simulationAwaitingChoice = true;
                // Stop simulating, disable transitions, and restore from state
                this.context.system.simulating = false;
                this.context.system.transitions = false;
                this._restoring = true;
                this.context.system?.restore?.().then(() => {
                  this._restoring = false;
                });
              } else if (
                this._stopSimulatingAt?.blockId === blockId &&
                this._stopSimulatingAt?.commandIndex === commandIndex
              ) {
                // We've caught up
                // Stop simulating, enable transitions, and restore from state
                this.context.system.simulating = false;
                this.context.system.transitions = true;
                this._restoring = true;
                this.context.system?.restore?.().then(() => {
                  this._restoring = false;
                });
              }
            } else {
              if (isSavepoint) {
                this.context.system?.checkpoint?.(commandId);
              }
            }
            if (this._restoring) {
              // Wait until game is fully restored
              return true;
            }
            this.willExecuteCommand(blockId, commandId, command?.source);
            let nextJumps: number[] = [];
            nextJumps = runner.onExecute(command);
            if (nextJumps.length > 0) {
              this.commandJumpStackPush(blockId, nextJumps);
            }
            if (!flow.isExecutingCommand) {
              return true;
            }
          }
          const finished = runner.isFinished(command);
          if (typeof finished === "string") {
            if (this._simulationAwaitingChoice) {
              // Choice was made, resume simulating and enable transitions
              this._simulationAwaitingChoice = false;
              this.context.system.simulating = true;
              this.context.system.transitions = true;
            }
            this.jumpToBlock(command.parent, command.index, finished);
            runner.onFinished(command);
            this.didExecuteCommand(
              blockId,
              commandId,
              commandIndex,
              command?.source
            );
            return true;
          }
          if (!this.context.system?.simulating && !finished) {
            return true;
          }
          runner.onFinished(command);
          this.didExecuteCommand(
            blockId,
            commandId,
            commandIndex,
            command?.source
          );
        }
      }
      if (
        blockState.commandJumpStack &&
        blockState.commandJumpStack.length > 0
      ) {
        const nextCommandIndex = this.commandJumpStackPop(blockId);
        if (nextCommandIndex !== undefined) {
          flow.currentCommandIndex = nextCommandIndex;
        }
      } else {
        const nextCommandIndex = flow.currentCommandIndex + 1;
        flow.currentCommandIndex = nextCommandIndex;
      }
      synchronousExecutionCount += 1;
    }
    return false;
  }

  override onPreview(checkpointId: string) {
    const checkpointLocation = this.getLocation(checkpointId);
    if (checkpointLocation) {
      const command = this.getCommandAt(
        checkpointLocation.blockId,
        checkpointLocation.commandIndex
      );
      if (command) {
        const runner = this._runnerMap[command.type];
        if (runner) {
          runner.onPreview(command);
        }
      }
    }
    return super.onPreview(checkpointId);
  }

  protected willExecuteCommand(
    blockId: string,
    commandId: string,
    source?: DocumentSource
  ) {
    const flow = this._flowMap[blockId];
    if (flow) {
      flow.isExecutingCommand = true;
    }
    // Command visits should only be stored in save state if they are used by a string substitution formatter
    // (this lets us avoid having to save EVERY command execution in the save file)
    this.visit(commandId, false);
    const location = this.getLocation(commandId);
    if (location) {
      this.emit(WillExecuteMessage.type.notification({ ...location, source }));
    }
  }

  protected didExecuteCommand(
    blockId: string,
    commandId: string,
    commandIndex: number,
    source?: DocumentSource
  ): void {
    const flow = this._flowMap[blockId];
    if (flow) {
      flow.isExecutingCommand = false;
      flow.previousCommandIndex = commandIndex;
    }
    const location = this.getLocation(commandId);
    if (location) {
      this.emit(DidExecuteMessage.type.notification({ ...location, source }));
    }
  }

  protected commandJumpStackPush(
    blockId: string,
    commandIndices: number[]
  ): void {
    const blockState = this._state.blocks?.[blockId];
    if (blockState) {
      commandIndices.forEach((index) => {
        blockState.commandJumpStack ??= [];
        const commandId = this.getCommandAt(blockId, index)?.id;
        if (commandId) {
          blockState.commandJumpStack.unshift(commandId);
        }
      });
    }
  }

  protected commandJumpStackPop(blockId: string): number | undefined {
    const blockState = this._state.blocks?.[blockId];
    if (blockState && blockState.commandJumpStack) {
      const commandId = blockState.commandJumpStack.shift();
      if (commandId) {
        return this.getLocation(commandId)?.commandIndex;
      }
    }
    return undefined;
  }

  executeBlock(blockName: string, startCommandIndex = 0): void {
    const block = this._blockMap[blockName];
    if (!block) {
      return;
    }
    this.resetBlockExecution(blockName);
    const blockState = this._state.blocks?.[blockName];
    const flow = this._flowMap[blockName];
    if (blockState && flow) {
      blockState.isExecuting = true;
      flow.currentCommandIndex = startCommandIndex;
      // Block visits should always be stored in save state
      this.visit(blockName, true);
    }
  }

  protected getNextBlockId(blockId: string): string | null | undefined {
    const block = this._blockMap[blockId];
    if (!block) {
      return undefined;
    }
    const blockIds = Object.keys(this._blockMap);
    const blockIndex = blockIds.indexOf(blockId);
    return blockIds[blockIndex + 1];
  }

  private continueToNextBlock(blockId: string): boolean {
    const nextBlockId = this.getNextBlockId(blockId);
    if (!nextBlockId) {
      return false;
    }
    this.enterBlock(nextBlockId);
    return true;
  }

  continue(blockId: string): boolean {
    const blockState = this._state.blocks?.[blockId];
    if (blockState) {
      if (
        blockState.willReturnToBlockId != null &&
        blockState.willReturnToCommandId != null
      ) {
        return this.returnFromBlock(blockId, "");
      }
    }
    return this.continueToNextBlock(blockId);
  }

  finishBlock(blockId: string): void {
    const block = this._blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this._state.blocks?.[blockId];
    if (blockState) {
      blockState.isExecuting = false;
      blockState.isFinished = true;
    }
  }

  stopBlock(blockId: string): void {
    const block = this._blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this._state.blocks?.[blockId];
    if (blockState) {
      blockState.isExecuting = false;
    }
  }

  enterBlock(
    blockId: string,
    startCommandIndex?: number,
    returnToBlockId?: string,
    returnToCommandId?: string
  ): void {
    const block = this._blockMap[blockId];
    if (!block) {
      return;
    }
    if (!this._blockMap[blockId]) {
      return;
    }
    const blockState = this._state.blocks?.[blockId] || createBlockState();
    blockState.willReturnToBlockId = returnToBlockId;
    blockState.willReturnToCommandId = returnToCommandId;
    this._state.blocks ??= {};
    this._state.blocks[blockId] = blockState;

    // Change activeParent
    const newActiveParent = blockId;

    // Unload all loaded blocks that are not an ancestor or direct child of new activeParent
    this._loaded.forEach((loadedBlockId) => {
      const loadedBlockParent = this._blockMap[loadedBlockId]?.parent ?? "";
      const loadedBlockParentPath =
        this._blockMap[loadedBlockParent]?.path.join(".") ?? "";
      const newActiveParentPath =
        this._blockMap[newActiveParent]?.path.join(".") ?? "";
      if (
        !newActiveParentPath.startsWith(loadedBlockParentPath) &&
        newActiveParent !== loadedBlockParent
      ) {
        this.unloadBlock(loadedBlockId);
        this.resetBlockExecution(loadedBlockId);
      }
    });
    const parent = this._blockMap?.[newActiveParent];
    const childIds = parent?.children || [];
    // Load activeParent and immediate child blocks
    this.loadBlocks([newActiveParent, ...childIds]);

    // Execute activeParent
    this.executeBlock(blockId, startCommandIndex);
  }

  jumpToBlock(
    currentBlockId: string,
    currentCommandIndex: number,
    newBlockId: string,
    returnWhenFinished?: boolean
  ): void {
    const nextCommand = this.getCommandAt(
      currentBlockId,
      currentCommandIndex + 1
    );
    this.stopBlock(currentBlockId);
    this.enterBlock(
      newBlockId,
      0,
      returnWhenFinished ? currentBlockId : undefined,
      returnWhenFinished ? nextCommand?.id : undefined
    );
  }

  returnFromBlock(blockId: string, value: unknown): boolean {
    const block = this._blockMap[blockId];
    if (!block) {
      return false;
    }

    const blockState = this._state.blocks?.[blockId];
    if (blockState) {
      blockState.isExecuting = false;
      blockState.isFinished = true;
    }

    const returnToBlockId = blockState?.willReturnToBlockId;
    if (returnToBlockId == null) {
      return false;
    }

    const returnToCommandId = blockState?.willReturnToCommandId;
    if (returnToCommandId == null) {
      return false;
    }

    const returnToCommandIndex =
      this.getLocation(returnToCommandId)?.commandIndex;

    this.context.returned ??= {};
    this.evaluate(`returned.${blockId} = ${value}`);

    const returnToBlockState = this._state.blocks?.[returnToBlockId];
    if (returnToBlockState) {
      this.enterBlock(
        returnToBlockId,
        returnToCommandIndex,
        returnToBlockState.willReturnToBlockId,
        returnToBlockState.willReturnToCommandId
      );
    }

    return true;
  }

  choose(executingBlockId: string, choiceId: string, jumpTo: string): string {
    // Choice visits should always be stored in save state
    this.visit(choiceId, true);
    // Seed is determined by how many times the choice has been chosen,
    // (instead of how many times the choice has been seen)
    const id = this.evaluateBlockId(executingBlockId, jumpTo);
    return id;
  }

  evaluateBlockId(executingBlockId: string, expression: string) {
    const selectedBlock = this.format(expression);
    const id = getRelativeSectionName(
      executingBlockId,
      this._blockMap,
      selectedBlock
    );
    return id;
  }

  visit(key: string, stored: boolean) {
    this._visited[key] ??= 0;
    this.context.$visited = this._visited[key]!;
    this.context.$key = key;
    this._visited[key] += 1;
    const count = this._visited[key]!;
    if (stored) {
      // Store in save state
      this.context.visited ??= {};
      this.context.visited![key] = count;
    }
    return count;
  }

  protected trackVisited() {
    this.context.$formatted_with_visited = false;
  }

  protected recordVisited() {
    // If format or evaluate uses $visited to determine its result,
    // it sets "$formatted_with_visited" to true
    // We can use this to determine which visitation counts should be automatically stored in the save state
    if (this.context.$formatted_with_visited) {
      const key = this.context.$key as any;
      if (key != null) {
        const count = this._visited[key];
        if (count != null) {
          this.context.visited ??= {};
          this.context.visited![key] = count;
        }
      }
    }
  }

  format(text: string): string {
    this.trackVisited();
    this.context.$seed = this._state.seed || "";
    const [result] = format(text, this.context);
    this.recordVisited();
    return result;
  }

  evaluate(expression: string): unknown {
    this.trackVisited();
    this.context.$seed = this._state.seed || "";
    const result = evaluate(expression, this.context);
    this.recordVisited();
    return result;
  }

  regenerateSeed(): string {
    const seed = this.context.system.uuid();
    this._state.seed = seed;
    this._random = randomizer(this._state.seed);
    return seed;
  }

  setSeed(seed: string): void {
    this._state.seed = seed;
    this._random = randomizer(this._state.seed);
  }

  shuffle<T>(array: T[]): T[] {
    return shuffle(array, this._random);
  }

  random(): number {
    return this._random();
  }

  randomInteger(): number {
    return this._random() * 0x100000000; // 2^32
  }

  getCommandAt(blockId: string, index: number): CommandData | undefined {
    return this._blockMap[blockId]?.commands?.[index];
  }

  getLocation(checkpointId: string) {
    // TODO: Report error if checkpoint not found
    const commandLocation = this._commandLocations[checkpointId];
    if (commandLocation) {
      return commandLocation;
    }
    const blockLocation = this._blockLocations[checkpointId];
    if (blockLocation) {
      return blockLocation;
    }
    return undefined;
  }

  getClosestSavepoint(checkpointId: string) {
    // TODO: Report error if checkpoint not found
    const commandLocation = this._commandLocations[checkpointId];
    if (commandLocation) {
      for (let i = commandLocation.commandIndex; i >= 0; i -= 1) {
        // Search backwards for closest savepoint
        const command = this._blockMap[commandLocation.blockId]?.commands[i];
        if (command && this.getRunner(command)?.isSavepoint(command)) {
          const commandLocation = this._commandLocations[command.id];
          if (commandLocation) {
            return commandLocation;
          }
        }
      }
      // Start of block is always a valid savepoint
      const blockLocation = this._blockLocations[commandLocation.blockId];
      if (blockLocation) {
        return blockLocation;
      }
    }
    const blockLocation = this._blockLocations[checkpointId];
    if (blockLocation) {
      return blockLocation;
    }
    return this.DEFAULT_LOCATION;
  }

  getClosestLocationBefore(
    targetCheckpointId: string,
    possibleCheckpointIds: string[]
  ) {
    // TODO: Report error if checkpoint not found
    const possibleLocations = possibleCheckpointIds
      .map((id) => this.getLocation(id))
      .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
    const targetLocation = this.getLocation(targetCheckpointId);
    if (targetLocation) {
      for (let i = possibleLocations.length; i >= 0; i -= 1) {
        // Search backwards for closest
        const possibleLocation = possibleLocations[i];
        if (possibleLocation) {
          if (possibleLocation.position < targetLocation.position) {
            return possibleLocation;
          }
        }
      }
    }
    return undefined;
  }

  override onCheckpoint(id: string) {
    const loc = this._commandLocations[id];
    if (loc) {
      // console.log("checkpointed at", this.getCommandAt(loc.parent, loc.index));
    }
    this._state.checkpoint = id;
  }
}
