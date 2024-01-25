import { RecursiveReadonly } from "../../../core";
import { GameEvent } from "../../../core/classes/GameEvent";
import { GameEvent1 } from "../../../core/classes/GameEvent1";
import { GameEvent2 } from "../../../core/classes/GameEvent2";
import { Manager } from "../../../core/classes/Manager";
import { GameContext } from "../../../core/types/GameContext";
import { evaluate } from "../../../core/utils/evaluate";
import { format } from "../../../core/utils/format";
import { randomizer } from "../../../core/utils/randomizer";
import { shuffle } from "../../../core/utils/shuffle";
import { uuid } from "../../../core/utils/uuid";
import { BlockData } from "../types/BlockData";
import { BlockState } from "../types/BlockState";
import { CommandData } from "../types/CommandData";
import { DocumentSource } from "../types/DocumentSource";
import { FlowLocation } from "../types/FlowLocation";
import { ICommandRunner } from "../types/ICommandRunner";
import createBlockState from "../utils/createBlockState";
import getRelativeSectionName from "../utils/getRelativeSectionName";

export interface LogicEvents extends Record<string, GameEvent> {
  onLoadBlock: GameEvent2<string, DocumentSource | undefined>;
  onUnloadBlock: GameEvent2<string, DocumentSource | undefined>;
  onUpdateBlock: GameEvent2<string, DocumentSource | undefined>;
  onChangeActiveParentBlock: GameEvent2<string, DocumentSource | undefined>;
  onExecuteBlock: GameEvent2<string, DocumentSource | undefined>;
  onFinishBlock: GameEvent2<string, DocumentSource | undefined>;
  onEnterBlock: GameEvent2<string, DocumentSource | undefined>;
  onStopBlock: GameEvent2<string, DocumentSource | undefined>;
  onReturnFromBlock: GameEvent2<string, DocumentSource | undefined>;
  onWillExecuteCommand: GameEvent2<string, DocumentSource | undefined>;
  onDidExecuteCommand: GameEvent2<string, DocumentSource | undefined>;
  onGoToCommand: GameEvent2<string, DocumentSource | undefined>;
  onChoose: GameEvent2<string, DocumentSource | undefined>;
  onLoadAsset: GameEvent2<string, DocumentSource | undefined>;
  onUnloadAsset: GameEvent2<string, DocumentSource | undefined>;
  onRegenerateSeed: GameEvent1<string>;
  onSetSeed: GameEvent1<string>;
}

export interface LogicConfig {
  waypoints?: string[];
  startpoint?: string;
  blockMap: Record<string, BlockData>;
  seeder: () => string;
}

export interface LogicState {
  blocks?: Record<string, BlockState>;
  seed?: string;
  checkpoint?: string;
}

export class LogicManager extends Manager<
  LogicEvents,
  LogicConfig,
  LogicState
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

  constructor(
    context: GameContext,
    config?: Partial<LogicConfig>,
    state?: Partial<LogicState>
  ) {
    const initialEvents: LogicEvents = {
      onLoadBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onUnloadBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onUpdateBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onExecuteBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onFinishBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onChangeActiveParentBlock: new GameEvent2<
        string,
        DocumentSource | undefined
      >(),
      onEnterBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onStopBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onReturnFromBlock: new GameEvent2<string, DocumentSource | undefined>(),
      onCheckTriggers: new GameEvent2<string, DocumentSource | undefined>(),
      onWillExecuteCommand: new GameEvent2<
        string,
        DocumentSource | undefined
      >(),
      onDidExecuteCommand: new GameEvent2<string, DocumentSource | undefined>(),
      onChoose: new GameEvent2<string, DocumentSource | undefined>(),
      onGoToCommand: new GameEvent2<string, DocumentSource | undefined>(),
      onSetVariableValue: new GameEvent2<string, DocumentSource | undefined>(),
      onLoadAsset: new GameEvent2<string, DocumentSource | undefined>(),
      onUnloadAsset: new GameEvent2<string, DocumentSource | undefined>(),
      onRegenerateSeed: new GameEvent1<string>(),
      onSetSeed: new GameEvent1<string>(),
    };
    const initialConfig: LogicConfig = {
      blockMap: {},
      seeder: uuid,
      ...(config || {}),
    };
    super(context, initialEvents, initialConfig, state || {}, ["visited"]);
    let position = 0;
    if (this._config?.blockMap) {
      // Populate _blockMap
      this._blockMap = JSON.parse(JSON.stringify(this._config?.blockMap));
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
    if (this._context?.["visited"]) {
      // Restore _visited
      Object.entries(this._context["visited"]).forEach(([key, count]) => {
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

  override onStart() {
    this._runners.forEach((r) => {
      r.onInit();
    });
    const closestWaypointLocation = this.getClosestLocationBefore(
      this._config.startpoint || "",
      (this._config.waypoints as string[]) || []
    );
    const startLocation =
      this.getLocation(this._config.startpoint || "") || this.DEFAULT_LOCATION;
    this._stopSimulatingAt = this.getClosestSavepoint(
      this._config.startpoint || ""
    );
    this._context.game ??= {};
    this._context.game.simulating =
      this._config.startpoint != null &&
      this._stopSimulatingAt != null &&
      closestWaypointLocation != null &&
      this._stopSimulatingAt.position > closestWaypointLocation.position;
    if (!this.state.checkpoint) {
      const entryLocation = this._context.game?.simulating
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

  private changeActiveParentBlock(newParentBlockId: string): void {
    const parent = this._blockMap?.[newParentBlockId]!;
    this._events.onChangeActiveParentBlock.dispatch(
      newParentBlockId,
      parent.source
    );
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

    const block = this._blockMap[blockId];
    this._events.onLoadBlock.dispatch(blockId, block?.source);
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

    const block = this._blockMap[blockId];
    this._events.onUnloadBlock.dispatch(blockId, block?.source);
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
    this._events.onUpdateBlock.dispatch(blockId, block.source);

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
            if (this._context.game?.simulating) {
              if (isChoicepoint) {
                // Must wait for user to make a choice
                this._simulationAwaitingChoice = true;
                // Stop simulating, disable transitions, and restore from state
                this._context.game ??= {};
                this._context.game.simulating = false;
                this._context.game.transitions = false;
                this._restoring = true;
                this._context.game?.restore?.().then(() => {
                  this._restoring = false;
                });
              } else if (
                this._stopSimulatingAt?.blockId === blockId &&
                this._stopSimulatingAt?.commandIndex === commandIndex
              ) {
                // We've caught up
                // Stop simulating, enable transitions, and restore from state
                this._context.game.simulating = false;
                this._context.game.transitions = true;
                this._restoring = true;
                this._context.game?.restore?.().then(() => {
                  this._restoring = false;
                });
              }
            } else {
              if (isSavepoint) {
                this._context.game?.checkpoint?.(commandId);
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
              this._context.game ??= {};
              this._context.game.simulating = true;
              this._context.game.transitions = true;
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
          if (!this._context.game?.simulating && !finished) {
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
          this.goToCommandIndex(blockId, nextCommandIndex, command?.source);
        }
      } else {
        const nextCommandIndex = flow.currentCommandIndex + 1;
        this.goToCommandIndex(blockId, nextCommandIndex, command?.source);
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
    this._events.onWillExecuteCommand.dispatch(commandId, source);
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
    this._events.onDidExecuteCommand.dispatch(commandId, source);
  }

  protected goToCommandIndex(
    blockId: string,
    index: number,
    source?: DocumentSource
  ): void {
    const flow = this._flowMap[blockId];
    if (flow) {
      flow.currentCommandIndex = index;
    }
    this._events.onGoToCommand.dispatch(blockId, source);
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
    this._events.onExecuteBlock.dispatch(blockName, block.source);
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
    this._events.onFinishBlock.dispatch(blockId, block.source);
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
    this._events.onStopBlock.dispatch(blockId, block.source);
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
    this.changeActiveParentBlock(newActiveParent);

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

    this._events.onEnterBlock.dispatch(blockId, block.source);
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

    this._context["returned"] ??= {};
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

    this._events.onReturnFromBlock.dispatch(blockId, block.source);

    return true;
  }

  choose(
    executingBlockId: string,
    choiceId: string,
    jumpTo: string,
    source?: DocumentSource
  ): string {
    // Choice visits should always be stored in save state
    this.visit(choiceId, true);
    // Seed is determined by how many times the choice has been chosen,
    // (instead of how many times the choice has been seen)
    const id = this.evaluateBlockId(executingBlockId, jumpTo);
    this._events.onChoose.dispatch(choiceId, source);
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
    this._context["$visited"] = this._visited[key] as any;
    this._context["$key"] = key as any;
    this._visited[key] += 1;
    const count = this._visited[key]!;
    if (stored) {
      // Store in save state
      this._context["visited"] ??= {};
      this._context["visited"]![key] = count;
    }
    return count;
  }

  protected trackVisited() {
    this._context["$formatted_with_visited"] = false as any;
  }

  protected recordVisited() {
    // If format or evaluate uses $visited to determine its result,
    // it sets "$formatted_with_visited" to true
    // We can use this to determine which visitation counts should be automatically stored in the save state
    if (this._context["$formatted_with_visited"]) {
      const key = this._context["$key"] as any;
      if (key != null) {
        const count = this._visited[key];
        if (count != null) {
          this._context["visited"] ??= {};
          this._context["visited"]![key] = count;
        }
      }
    }
  }

  format(text: string): string {
    this.trackVisited();
    this._context["$seed"] = this._state.seed as any;
    const [result] = format(text, this._context);
    this.recordVisited();
    return result;
  }

  evaluate(expression: string): unknown {
    this.trackVisited();
    this._context["$seed"] = this._state.seed as any;
    const result = evaluate(expression, this._context);
    this.recordVisited();
    return result;
  }

  regenerateSeed(): string {
    const seed = this._config.seeder();
    this._state.seed = seed;
    this._random = randomizer(this._state.seed);
    this._events.onRegenerateSeed.dispatch(seed);
    return seed;
  }

  setSeed(seed: string): void {
    this._state.seed = seed;
    this._random = randomizer(this._state.seed);
    this._events.onSetSeed.dispatch(seed);
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

  getCommands(blockId: string | undefined): CommandData[] {
    if (blockId) {
      return this._blockMap[blockId]?.commands || [];
    }
    return [];
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
