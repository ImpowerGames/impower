import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Block } from "../types/Block";
import { BlockState } from "../types/BlockState";
import { VariableState } from "../types/VariableState";
import { createBlockState } from "../utils/createBlockState";

export interface LogicEvents extends Record<string, GameEvent> {
  onLoadBlock: GameEvent<{ from?: number; line?: number; blockId: string }>;
  onUnloadBlock: GameEvent<{ from?: number; line?: number; blockId: string }>;
  onUpdateBlock: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    time: number;
    delta: number;
  }>;
  onChangeActiveParentBlock: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
  }>;
  onExecuteBlock: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    executedByBlockId: string | null;
    value: number;
  }>;
  onFinishBlock: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    executedByBlockId: string | null;
  }>;
  onEnterBlock: GameEvent<{ from?: number; line?: number; blockId: string }>;
  onStopBlock: GameEvent<{ from?: number; line?: number; blockId: string }>;
  onReturnFromBlock: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
  }>;
  onCheckTriggers: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    shouldExecute: boolean;
    satisfiedTriggers: string[];
    unsatisfiedTriggers: string[];
  }>;
  onExecuteCommand: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onChooseChoice: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
  }>;
  onFinishCommand: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onGoToCommandIndex: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    index: number;
  }>;
  onCommandJumpStackPush: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
    indices: number[];
  }>;
  onCommandJumpStackPop: GameEvent<{
    from?: number;
    line?: number;
    blockId: string;
  }>;
  onSetVariableValue: GameEvent<{
    from?: number;
    line?: number;
    variableId: string;
    value: unknown;
  }>;
  onLoadAsset: GameEvent<{
    assetId: string;
  }>;
  onUnloadAsset: GameEvent<{
    assetId: string;
  }>;
}

export interface LogicConfig {
  blockMap: Record<string, Block>;
}

export interface LogicState {
  activeParentBlockId: string;
  activeCommandIndex: number;
  changedBlocks: string[];
  changedVariables: string[];
  loadedBlockIds: string[];
  loadedAssetIds: string[];
  blockStates: { [blockId: string]: BlockState };
  variableStates: { [variableId: string]: VariableState };
}

export class LogicManager extends Manager<
  LogicEvents,
  LogicConfig,
  LogicState
> {
  constructor(config?: Partial<LogicConfig>, state?: Partial<LogicState>) {
    const initialEvents: LogicEvents = {
      onLoadBlock: new GameEvent<{
        blockId: string;
        from?: number;
        line?: number;
      }>(),
      onUnloadBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
      }>(),
      onUpdateBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        time: number;
        delta: number;
      }>(),
      onExecuteBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        executedByBlockId: string | null;
        value: number;
      }>(),
      onFinishBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        executedByBlockId: string | null;
      }>(),
      onChangeActiveParentBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
      }>(),
      onEnterBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
      }>(),
      onStopBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
      }>(),
      onReturnFromBlock: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
      }>(),
      onCheckTriggers: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        shouldExecute: boolean;
        satisfiedTriggers: string[];
        unsatisfiedTriggers: string[];
      }>(),
      onExecuteCommand: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onChooseChoice: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
      }>(),
      onFinishCommand: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onGoToCommandIndex: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        index: number;
      }>(),
      onCommandJumpStackPush: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
        indices: number[];
      }>(),
      onCommandJumpStackPop: new GameEvent<{
        from?: number;
        line?: number;
        blockId: string;
      }>(),
      onSetVariableValue: new GameEvent<{
        from?: number;
        line?: number;
        variableId: string;
        value: unknown;
      }>(),
      onLoadAsset: new GameEvent<{
        assetId: string;
      }>(),
      onUnloadAsset: new GameEvent<{
        assetId: string;
      }>(),
    };
    const initialConfig: LogicConfig = {
      blockMap: {},
      ...(config || {}),
    };
    const initialState: LogicState = {
      activeParentBlockId: "",
      activeCommandIndex: 0,
      changedBlocks: [],
      changedVariables: [],
      loadedBlockIds: [],
      loadedAssetIds: [],
      blockStates: {},
      variableStates: {},
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  override init() {
    this.enterBlock(
      this._state.activeParentBlockId,
      false,
      null,
      this._state.activeCommandIndex
    );
  }

  private changeActiveParentBlock(newParentBlockId: string): void {
    if (this._state.activeParentBlockId === newParentBlockId) {
      return;
    }
    this._state.activeParentBlockId = newParentBlockId;
    const parent = this._config.blockMap?.[newParentBlockId];
    this._events.onChangeActiveParentBlock.emit({
      from: parent?.from,
      line: parent?.line,
      blockId: newParentBlockId,
    });
  }

  private resetBlockExecution(blockId: string): void {
    if (!this._state.blockStates[blockId]) {
      this._state.changedBlocks.push(blockId);
    }
    const blockState =
      this._state.blockStates[blockId] || createBlockState(blockId);
    blockState.executedBy = "";
    blockState.isExecuting = false;
    blockState.hasFinished = false;
    blockState.previousIndex = -1;
    blockState.executingIndex = 0;
    blockState.commandJumpStack = [];
    blockState.lastExecutedAt = -1;
    blockState.time = -1;
    blockState.delta = -1;
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

    if (!this._state.blockStates[blockId]) {
      this._state.changedBlocks.push(blockId);
    }
    const blockState =
      this._state.blockStates[blockId] || createBlockState(blockId);
    this._state.blockStates[blockId] = blockState;
    if (blockState.loaded) {
      return;
    }
    blockState.loaded = true;

    this._events.onLoadBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
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
    this._events.onUnloadBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
  }

  updateBlock(blockId: string, time: number, delta: number): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.time = time;
      blockState.delta = delta;
    }
    this._events.onUpdateBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
      time,
      delta,
    });
  }

  executeBlock(
    blockId: string,
    executedByBlockId: string | null,
    startIndex?: number
  ): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    this.resetBlockExecution(blockId);
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.executionCount += 1;
      blockState.executedBy = executedByBlockId;
      blockState.isExecuting = true;
      blockState.startIndex = startIndex || 0;
    }
    this._events.onExecuteBlock.emit({
      from: block.from,
      line: block.line,
      value: blockState?.executionCount || 0,
      blockId,
      executedByBlockId,
    });
  }

  getNextBlockId(blockId: string): string | null | undefined {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return undefined;
    }
    if (block.type !== "section") {
      return null;
    }
    const blockList = Object.entries(this._config.blockMap).slice(
      block.index + 1
    );
    const [nextBlockId] = blockList.find(([, v]) => v.type === "section") || [
      undefined,
      undefined,
    ];
    return nextBlockId;
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
    this._events.onFinishBlock.emit({
      from: block.from,
      line: block.line,
      executedByBlockId: blockState?.executedBy || null,
      blockId,
    });
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
    if (!this._state.blockStates[blockId]) {
      this._state.changedBlocks.push(blockId);
    }
    const blockState =
      this._state.blockStates[blockId] || createBlockState(blockId);
    if (returnWhenFinished) {
      blockState.hasReturned = false;
      blockState.returnedFrom = "";
    }
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

    this._events.onEnterBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
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
    this._events.onStopBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
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

    const variableId = `${blockId}.return`;
    this.setVariableValue(variableId, value, block.from, block.line);

    const executedByBlockState = this._state.blockStates[executedByBlockId];
    if (executedByBlockState) {
      this.enterBlock(
        executedByBlockId,
        executedByBlockState.returnWhenFinished,
        executedByBlockState.executedBy,
        executedByBlockState.executingIndex + 1
      );
      executedByBlockState.hasReturned = true;
      executedByBlockState.returnedFrom = blockId;
    }

    this._events.onReturnFromBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });

    return true;
  }

  chooseChoice(
    blockId: string,
    commandId: string,
    commandIndex: number,
    from?: number,
    line?: number
  ): number {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      const currentCount = blockState.choiceChosenCounts[commandId] || 0;
      const newCount = currentCount + 1;
      blockState.choiceChosenCounts[commandId] = newCount;
      this._events.onChooseChoice.emit({
        blockId,
        commandId,
        commandIndex,
        from,
        line,
      });
      return newCount;
    }
    return -1;
  }

  executeCommand(
    blockId: string,
    commandId: string,
    commandIndex: number,
    time: number,
    from?: number,
    line?: number
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.lastExecutedAt = time;
      const currentCount = blockState.commandExecutionCounts[commandId] || 0;
      blockState.commandExecutionCounts[commandId] = currentCount + 1;
      if (blockState.startIndex <= blockState.executingIndex) {
        blockState.startIndex = 0;
      }
    }
    this._events.onExecuteCommand.emit({
      blockId,
      commandId,
      commandIndex,
      time,
      from,
      line,
    });
  }

  finishCommand(
    blockId: string,
    commandId: string,
    commandIndex: number,
    time: number,
    from?: number,
    line?: number
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.lastExecutedAt = -1;
      blockState.previousIndex = commandIndex;
    }
    this._events.onFinishCommand.emit({
      blockId,
      commandId,
      commandIndex,
      time,
      from,
      line,
    });
  }

  checkTriggers(
    blockId: string,
    shouldExecute: boolean,
    satisfiedTriggers: string[],
    unsatisfiedTriggers: string[]
  ): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.satisfiedTriggers = satisfiedTriggers;
      blockState.unsatisfiedTriggers = unsatisfiedTriggers;
      this._events.onCheckTriggers.emit({
        from: block.from,
        line: block.line,
        blockId,
        shouldExecute,
        satisfiedTriggers,
        unsatisfiedTriggers,
      });
    }
  }

  goToCommandIndex(
    blockId: string,
    index: number,
    from?: number,
    line?: number
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.executingIndex = index;
    }
    this._events.onGoToCommandIndex.emit({ blockId, index, from, line });
  }

  commandJumpStackPush(
    blockId: string,
    indices: number[],
    from?: number,
    line?: number
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.commandJumpStack.unshift(...indices);
    }
    this._events.onCommandJumpStackPush.emit({ blockId, indices, from, line });
  }

  commandJumpStackPop(
    blockId: string,
    from?: number,
    line?: number
  ): number | undefined {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      const index = blockState.commandJumpStack.shift();
      this._events.onCommandJumpStackPop.emit({ blockId, from, line });
      return index;
    }
    return undefined;
  }

  setVariableValue(
    variableId: string,
    value: unknown,
    from?: number,
    line?: number
  ): void {
    if (!this._state.variableStates[variableId]) {
      this._state.changedVariables.push(variableId);
    }
    const variableState = this._state.variableStates[variableId] || {
      name: variableId.split(".").slice(-1).join(""),
      value: value,
    };
    variableState.value = value;
    this._state.variableStates[variableId] = variableState;
    this._events.onSetVariableValue.emit({ variableId, value, from, line });
  }

  getRuntimeValue(id: string): unknown {
    const variableState = this._state.variableStates?.[id];
    if (variableState) {
      return variableState.value;
    }
    const blockState = this._state.blockStates?.[id];
    if (blockState) {
      return blockState.executionCount;
    }
    return undefined;
  }

  setRuntimeValue(id: string, value: unknown): void {
    this.setVariableValue(id, value);
  }
}
