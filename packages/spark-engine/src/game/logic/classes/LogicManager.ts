import { GameEvent } from "../../core/classes/GameEvent";
import { GameEvent1 } from "../../core/classes/GameEvent1";
import { GameEvent2 } from "../../core/classes/GameEvent2";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";
import { evaluate } from "../../core/utils/evaluate";
import { format } from "../../core/utils/format";
import { randomizer } from "../../core/utils/randomizer";
import { setProperty } from "../../core/utils/setProperty";
import { shuffle } from "../../core/utils/shuffle";
import { uuid } from "../../core/utils/uuid";
import { Block } from "../types/Block";
import { BlockState } from "../types/BlockState";
import { CommandRunner } from "../types/CommandRunner";
import { DocumentSource } from "../types/DocumentSource";
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
  onExecuteCommand: GameEvent2<string, DocumentSource | undefined>;
  onChooseChoice: GameEvent2<string, DocumentSource | undefined>;
  onFinishCommand: GameEvent2<string, DocumentSource | undefined>;
  onGoToCommandIndex: GameEvent2<string, DocumentSource | undefined>;
  onCommandJumpStackPush: GameEvent2<string, DocumentSource | undefined>;
  onCommandJumpStackPop: GameEvent2<string, DocumentSource | undefined>;
  onLoadAsset: GameEvent2<string, DocumentSource | undefined>;
  onUnloadAsset: GameEvent2<string, DocumentSource | undefined>;
  onRegenerateSeed: GameEvent1<string>;
  onSetSeed: GameEvent1<string>;
}

export interface LogicConfig {
  simulateFromBlockId?: string;
  simulateFromCommandIndex?: number;
  startFromBlockId: string;
  startFromCommandIndex: number;
  blockMap: Record<string, Block>;
  valueMap: Record<string, Record<string, any>>;
  stored: string[];
  seeder: () => string;
}

export interface LogicState {
  currentBlockId: string;
  currentCommandIndex: number;
  loadedBlockIds: string[];

  valueStates: Record<string, any>;
  blockStates: Record<string, BlockState>;

  commandExecuted: Record<string, number>;
  choiceChosen: Record<string, number>;

  seed: string;
}

export class LogicManager extends Manager<
  LogicEvents,
  LogicConfig,
  LogicState
> {
  protected _valueMap: Record<string, Record<string, any>> = {};
  get valueMap() {
    return this._valueMap;
  }

  protected _random: () => number;

  constructor(
    environment: Environment,
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
      onExecuteCommand: new GameEvent2<string, DocumentSource | undefined>(),
      onChooseChoice: new GameEvent2<string, DocumentSource | undefined>(),
      onFinishCommand: new GameEvent2<string, DocumentSource | undefined>(),
      onGoToCommandIndex: new GameEvent2<string, DocumentSource | undefined>(),
      onCommandJumpStackPush: new GameEvent2<
        string,
        DocumentSource | undefined
      >(),
      onCommandJumpStackPop: new GameEvent2<
        string,
        DocumentSource | undefined
      >(),
      onSetVariableValue: new GameEvent2<string, DocumentSource | undefined>(),
      onLoadAsset: new GameEvent2<string, DocumentSource | undefined>(),
      onUnloadAsset: new GameEvent2<string, DocumentSource | undefined>(),
      onRegenerateSeed: new GameEvent1<string>(),
      onSetSeed: new GameEvent1<string>(),
    };
    const initialConfig: LogicConfig = {
      blockMap: {},
      valueMap: {},
      stored: [],
      startFromBlockId: "",
      startFromCommandIndex: 0,
      seeder: uuid,
      ...(config || {}),
    };
    const initialState: LogicState = {
      currentBlockId: "",
      currentCommandIndex: 0,
      loadedBlockIds: [],
      blockStates: {},
      valueStates: {},
      commandExecuted: {},
      choiceChosen: {},
      seed: initialConfig.seeder(),
      ...(state || {}),
    };
    super(environment, initialEvents, initialConfig, initialState);
    if (this._config?.valueMap) {
      this._valueMap = JSON.parse(JSON.stringify(this._config?.valueMap));
    }
    if (this._state.valueStates) {
      // Restore value states
      Object.entries(this._state.valueStates).forEach(([accessPath, value]) => {
        setProperty(this._valueMap, accessPath, value);
      });
    }
    this._random = randomizer(this._state.seed);
  }

  override init() {
    const simulating =
      this._config?.simulateFromBlockId != null ||
      this._config?.simulateFromCommandIndex != null;
    this.enterBlock(
      simulating
        ? this._config.simulateFromBlockId ?? ""
        : this._config.startFromBlockId,
      false,
      null,
      simulating
        ? this._config.simulateFromCommandIndex ?? 0
        : this._config.startFromCommandIndex
    );
  }

  private changeActiveParentBlock(newParentBlockId: string): void {
    if (this._state.currentBlockId === newParentBlockId) {
      return;
    }
    this._state.currentBlockId = newParentBlockId;
    if (
      this._config.simulateFromBlockId != null &&
      this._state.currentBlockId
    ) {
    }
    const parent = this._config.blockMap?.[newParentBlockId]!;
    this._events.onChangeActiveParentBlock.dispatch(
      newParentBlockId,
      parent.source
    );
  }

  private resetBlockExecution(blockId: string): void {
    const blockState = this._state.blockStates[blockId] || createBlockState();
    blockState.isExecuting = false;
    blockState.isExecutingCommand = false;
    blockState.hasFinished = false;
    blockState.executedBy = "";
    blockState.previousIndex = -1;
    blockState.executingIndex = 0;
    blockState.commandJumpStack = [];
    this._state.blockStates[blockId] = blockState;
  }

  private loadBlock(blockId: string): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    if (this._state.loadedBlockIds.includes(blockId)) {
      return;
    }
    this._state.loadedBlockIds.push(blockId);

    const blockState = this._state.blockStates[blockId] || createBlockState();
    this._state.blockStates[blockId] = blockState;
    if (blockState.loaded) {
      return;
    }
    blockState.loaded = true;

    this._events.onLoadBlock.dispatch(blockId, block.source);
  }

  private loadBlocks(blockIds: string[]): void {
    blockIds.map((blockId) => this.loadBlock(blockId));
  }

  private unloadBlock(blockId: string): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    if (!this._state.loadedBlockIds.includes(blockId)) {
      return;
    }
    this._state.loadedBlockIds = this._state.loadedBlockIds.filter(
      (id) => id !== blockId
    );
    const blockState = this._state.blockStates[blockId];
    if (!blockState?.loaded) {
      return;
    }
    blockState.loaded = false;
    this._events.onUnloadBlock.dispatch(blockId, block.source);
  }

  updateBlock(
    blockId: string,
    getRunner: (commandTypeId: string) => CommandRunner
  ): boolean | null {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return false;
    }
    this._events.onUpdateBlock.dispatch(blockId, block.source);

    const blockState = this._state.blockStates[blockId];
    if (!blockState) {
      return false;
    }

    if (blockState.isExecuting) {
      const running = this.runCommands(blockId, getRunner);
      if (running === null) {
        return null;
      }
      if (running === false) {
        this.finishBlock(blockId);
        this.continue(blockId);
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
    getRunner: (commandTypeId: string) => CommandRunner
  ): boolean | null {
    const commands = this._config.blockMap[blockId]?.commands;
    if (!commands) {
      return false;
    }
    const blockState = this._state.blockStates[blockId];
    if (!blockState) {
      return false;
    }
    while (blockState.executingIndex < commands.length) {
      const command = commands[blockState.executingIndex];
      if (command) {
        const runner = getRunner(command.reference.typeId);
        const commandId = command.reference.id;
        const commandIndex = blockState.executingIndex;
        const source = command?.source;
        if (!blockState.isExecutingCommand) {
          this.executeCommand(blockId, commandId, source);
          let nextJumps: number[] = [];
          nextJumps = runner.onExecute(command, {
            index: blockState.executingIndex,
            commands,
          });
          if (nextJumps.length > 0) {
            this.commandJumpStackPush(blockId, nextJumps, source);
          }
          if (!blockState.isExecutingCommand) {
            return true;
          }
        }
        if (!this.environment.simulating && command.params.waitUntilFinished) {
          const finished = runner.isFinished(command, {
            index: blockState.executingIndex,
            commands,
          });
          if (finished === null) {
            return null;
          }
          if (!finished) {
            return true;
          }
        }
        runner.onFinished(command, {
          index: blockState.executingIndex,
          commands,
        });
        this.finishCommand(blockId, commandId, commandIndex, source);
        if (blockState.commandJumpStack.length > 0) {
          const nextCommandIndex = this.commandJumpStackPop(blockId, source);
          if (nextCommandIndex !== undefined) {
            this.goToCommandIndex(blockId, nextCommandIndex, source);
          }
        } else {
          const nextCommandIndex = blockState.executingIndex + 1;
          this.goToCommandIndex(blockId, nextCommandIndex, source);
        }
      }
    }
    return false;
  }

  protected executeCommand(
    blockId: string,
    commandId: string,
    source?: DocumentSource
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      if (
        (this._config.simulateFromBlockId != null ||
          this._config.simulateFromCommandIndex != null) &&
        this._config.startFromBlockId === blockId &&
        this._config.startFromCommandIndex === blockState.executingIndex
      ) {
        // We've caught up, stop simulating
        this._environment.simulating = false;
      }
      blockState.isExecutingCommand = true;
      const currentExecutionCount = this._state.commandExecuted[commandId] || 0;
      this._state.commandExecuted[commandId] = currentExecutionCount + 1;
      this._valueMap["$visited"] = currentExecutionCount as any;
      this._valueMap["$choice"] = commandId as any;
    }
    this._events.onExecuteCommand.dispatch(commandId, source);
  }

  protected finishCommand(
    blockId: string,
    commandId: string,
    commandIndex: number,
    source?: DocumentSource
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.isExecutingCommand = false;
      blockState.previousIndex = commandIndex;
    }
    this._events.onFinishCommand.dispatch(commandId, source);
  }

  protected goToCommandIndex(
    blockId: string,
    index: number,
    source?: DocumentSource
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.executingIndex = index;
    }
    this._events.onGoToCommandIndex.dispatch(blockId, source);
  }

  protected commandJumpStackPush(
    blockId: string,
    indices: number[],
    source?: DocumentSource
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.commandJumpStack.unshift(...indices);
    }
    this._events.onCommandJumpStackPush.dispatch(blockId, source);
  }

  protected commandJumpStackPop(
    blockId: string,
    source?: DocumentSource
  ): number | undefined {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      const index = blockState.commandJumpStack.shift();
      this._events.onCommandJumpStackPop.dispatch(blockId, source);
      return index;
    }
    return undefined;
  }

  executeBlock(
    blockName: string,
    executedBy: string | null,
    startIndex?: number
  ): void {
    const block = this._config.blockMap[blockName];
    if (!block) {
      return;
    }
    this.resetBlockExecution(blockName);
    const blockState = this._state.blockStates[blockName];
    if (blockState) {
      blockState.executedBy = executedBy;
      blockState.isExecuting = true;
      blockState.executingIndex = startIndex ?? 0;
      const currentExecutionCount =
        this._valueMap?.["visited"]?.[blockName] ?? 0;
      this._valueMap["visited"] ??= {};
      this._valueMap["visited"]![blockName] = currentExecutionCount + 1;
    }
    this._events.onExecuteBlock.dispatch(blockName, block.source);
  }

  getNextBlockId(blockId: string): string | null | undefined {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return undefined;
    }
    const blockIds = Object.keys(this._config.blockMap);
    const blockIndex = blockIds.indexOf(blockId);
    return blockIds[blockIndex + 1];
  }

  private continueToNextBlock(blockId: string): boolean {
    const nextBlockId = this.getNextBlockId(blockId);
    if (!nextBlockId) {
      return false;
    }
    this.enterBlock(nextBlockId, false, blockId);
    return true;
  }

  continue(blockId: string): boolean {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      if (blockState.returnWhenFinished) {
        return this.returnFromBlock(blockId, "");
      }
    }
    return this.continueToNextBlock(blockId);
  }

  finishBlock(blockId: string): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.isExecuting = false;
      blockState.hasFinished = true;
    }
    this._events.onFinishBlock.dispatch(blockId, block.source);
  }

  stopBlock(blockId: string): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.isExecuting = false;
    }
    this._events.onStopBlock.dispatch(blockId, block.source);
  }

  enterBlock(
    blockId: string,
    returnWhenFinished: boolean,
    executedByBlockId: string | null,
    startIndex?: number
  ): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    if (!this._config.blockMap[blockId]) {
      return;
    }
    const blockState = this._state.blockStates[blockId] || createBlockState();
    blockState.returnWhenFinished = returnWhenFinished;
    this._state.blockStates[blockId] = blockState;

    // Change activeParent
    const newActiveParent = blockId;
    this.changeActiveParentBlock(newActiveParent);

    // Unload all loaded blocks that are not an ancestor or direct child of new activeParent
    this._state.loadedBlockIds.forEach((loadedBlockId) => {
      const loadedBlockParent = loadedBlockId.split(".").slice(0, -1).join(".");
      if (
        !newActiveParent.startsWith(loadedBlockId) &&
        newActiveParent !== loadedBlockParent
      ) {
        this.unloadBlock(loadedBlockId);
        this.resetBlockExecution(loadedBlockId);
      }
    });
    const parent = this._config.blockMap?.[newActiveParent];
    const childIds = parent?.children || [];
    // Load activeParent and immediate child blocks
    this.loadBlocks([newActiveParent, ...childIds]);

    // Execute activeParent
    this.executeBlock(blockId, executedByBlockId, startIndex);

    this._events.onEnterBlock.dispatch(blockId, block.source);
  }

  jumpToBlock(
    currentBlockId: string,
    newBlockId: string,
    returnWhenFinished: boolean
  ): void {
    this.stopBlock(currentBlockId);
    this.enterBlock(newBlockId, returnWhenFinished, currentBlockId);
  }

  returnFromBlock(blockId: string, value: unknown): boolean {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return false;
    }

    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.isExecuting = false;
      blockState.hasFinished = true;
    }

    const executedByBlockId = this._state.blockStates[blockId]?.executedBy;
    if (!executedByBlockId) {
      return false;
    }

    this.evaluate(`${blockId}.return = ${value}`);

    const executedByBlockState = this._state.blockStates[executedByBlockId];
    if (executedByBlockState) {
      this.enterBlock(
        executedByBlockId,
        executedByBlockState.returnWhenFinished ?? false,
        executedByBlockState.executedBy,
        executedByBlockState.executingIndex + 1
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
    const chosenCount = this._state.choiceChosen[choiceId] || 0;
    // Seed is determined by how many times the choice has been chosen,
    // (instead of how many times the choice has been seen)
    const id = this.evaluateBlockId(executingBlockId, jumpTo, {
      $visited: chosenCount,
      $choice: choiceId,
    });
    this._state.choiceChosen[choiceId] = chosenCount + 1;
    this._events.onChooseChoice.dispatch(choiceId, source);
    return id;
  }

  evaluateBlockId(
    executingBlockId: string,
    expression: string,
    overrides?: { $visited?: number; $choice?: string }
  ) {
    const selectedBlock = this.format(expression, overrides);
    const id = getRelativeSectionName(
      executingBlockId,
      this._config.blockMap,
      selectedBlock
    );
    return id;
  }

  format(
    text: string,
    overrides?: { $visited?: number; $choice?: string }
  ): string {
    this._valueMap["$seed"] = this._state.seed as any;
    const context = overrides
      ? { ...this._valueMap, ...overrides }
      : this._valueMap;
    const [result] = format(text, context);
    return result;
  }

  evaluate(
    expression: string,
    overrides?: { $visited?: number; $choice?: string }
  ): unknown {
    this._valueMap["$seed"] = this._state.seed as any;
    const context = overrides
      ? { ...this._valueMap, ...overrides }
      : this._valueMap;
    const result = evaluate(expression, context);
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

  override onSerialize() {
    if (this._config?.stored) {
      this._config.stored.forEach((accessPath) => {
        try {
          this._state.valueStates[accessPath] = evaluate(
            accessPath,
            this._valueMap
          );
        } catch {
          // value does not exist
        }
      });
    }
  }
}
