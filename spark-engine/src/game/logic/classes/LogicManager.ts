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
      this.state.activeParentBlockId,
      false,
      null,
      this.state.activeCommandIndex
    );
  }

  private changeActiveParentBlock(newParentBlockId: string): void {
    if (this.state.activeParentBlockId === newParentBlockId) {
      return;
    }
    this.state.activeParentBlockId = newParentBlockId;
    const parent = this.config.blockMap?.[newParentBlockId];
    this.events.onChangeActiveParentBlock.emit({
      from: parent?.from,
      line: parent?.line,
      blockId: newParentBlockId,
    });
  }

  private resetBlockExecution(blockId: string): void {
    if (!this.state.blockStates[blockId]) {
      this.state.changedBlocks.push(blockId);
    }
    const blockState =
      this.state.blockStates[blockId] || createBlockState(blockId);
    blockState.executedBy = "";
    blockState.isExecuting = false;
    blockState.hasFinished = false;
    blockState.previousIndex = -1;
    blockState.executingIndex = 0;
    blockState.commandJumpStack = [];
    blockState.lastExecutedAt = -1;
    blockState.time = -1;
    blockState.delta = -1;
    this.state.blockStates[blockId] = blockState;
  }

  private loadBlock(blockId: string): void {
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    if (this.state.loadedBlockIds.includes(blockId)) {
      return;
    }
    this.state.loadedBlockIds.push(blockId);

    if (!this.state.blockStates[blockId]) {
      this.state.changedBlocks.push(blockId);
    }
    const blockState =
      this.state.blockStates[blockId] || createBlockState(blockId);
    this.state.blockStates[blockId] = blockState;
    if (blockState.loaded) {
      return;
    }
    blockState.loaded = true;

    this.events.onLoadBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
  }

  private loadBlocks(blockIds: string[]): void {
    blockIds.map((blockId) => this.loadBlock(blockId));
  }

  private unloadBlock(blockId: string): void {
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    if (!this.state.loadedBlockIds.includes(blockId)) {
      return;
    }
    this.state.loadedBlockIds = this.state.loadedBlockIds.filter(
      (id) => id !== blockId
    );
    const blockState = this.state.blockStates[blockId];
    if (!blockState?.loaded) {
      return;
    }
    blockState.loaded = false;
    this.events.onUnloadBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
  }

  updateBlock(blockId: string, time: number, delta: number): void {
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.time = time;
      blockState.delta = delta;
    }
    this.events.onUpdateBlock.emit({
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
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    this.resetBlockExecution(blockId);
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.executionCount += 1;
      blockState.executedBy = executedByBlockId;
      blockState.isExecuting = true;
      blockState.startIndex = startIndex || 0;
    }
    this.events.onExecuteBlock.emit({
      from: block.from,
      line: block.line,
      value: blockState?.executionCount || 0,
      blockId,
      executedByBlockId,
    });
  }

  getNextBlockId(blockId: string): string | null | undefined {
    const block = this.config.blockMap[blockId];
    if (!block) {
      return undefined;
    }
    if (block.type !== "section") {
      return null;
    }
    const blockList = Object.entries(this.config.blockMap).slice(
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
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      if (blockState.returnWhenFinished) {
        return this.returnFromBlock(blockId, "");
      }
    }
    return this.continueToNextBlock(blockId);
  }

  finishBlock(blockId: string): void {
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.isExecuting = false;
      blockState.hasFinished = true;
    }
    this.events.onFinishBlock.emit({
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
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    if (!this.config.blockMap[blockId]) {
      return;
    }
    if (!this.state.blockStates[blockId]) {
      this.state.changedBlocks.push(blockId);
    }
    const blockState =
      this.state.blockStates[blockId] || createBlockState(blockId);
    if (returnWhenFinished) {
      blockState.hasReturned = false;
      blockState.returnedFrom = "";
    }
    this.state.blockStates[blockId] = blockState;

    // Change activeParent
    const newActiveParent = blockId;
    this.changeActiveParentBlock(newActiveParent);

    // Unload all loaded blocks that are not an ancestor or direct child of new activeParent
    this.state.loadedBlockIds.forEach((loadedBlockId) => {
      const loadedBlockParent = loadedBlockId.split(".").slice(0, -1).join(".");
      if (
        !newActiveParent.startsWith(loadedBlockId) &&
        newActiveParent !== loadedBlockParent
      ) {
        this.unloadBlock(loadedBlockId);
        this.resetBlockExecution(loadedBlockId);
      }
    });
    const parent = this.config.blockMap?.[newActiveParent];
    const childIds = parent?.children || [];
    // Load activeParent and immediate child blocks
    this.loadBlocks([newActiveParent, ...childIds]);

    // Execute activeParent
    this.executeBlock(blockId, executedByBlockId, startIndex);

    this.events.onEnterBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
  }

  stopBlock(blockId: string): void {
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.isExecuting = false;
    }
    this.events.onStopBlock.emit({
      from: block.from,
      line: block.line,
      blockId,
    });
  }

  returnFromBlock(blockId: string, value: unknown): boolean {
    const block = this.config.blockMap[blockId];
    if (!block) {
      return false;
    }

    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.isExecuting = false;
      blockState.hasFinished = true;
    }

    const executedByBlockId = this.state.blockStates[blockId]?.executedBy;
    if (!executedByBlockId) {
      return false;
    }

    const variableId = `${blockId}.return`;
    this.setVariableValue(variableId, value, block.from, block.line);

    const executedByBlockState = this.state.blockStates[executedByBlockId];
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

    this.events.onReturnFromBlock.emit({
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
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      const currentCount = blockState.choiceChosenCounts[commandId] || 0;
      const newCount = currentCount + 1;
      blockState.choiceChosenCounts[commandId] = newCount;
      this.events.onChooseChoice.emit({
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
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.lastExecutedAt = time;
      const currentCount = blockState.commandExecutionCounts[commandId] || 0;
      blockState.commandExecutionCounts[commandId] = currentCount + 1;
      if (blockState.startIndex <= blockState.executingIndex) {
        blockState.startIndex = 0;
      }
    }
    this.events.onExecuteCommand.emit({
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
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.lastExecutedAt = -1;
      blockState.previousIndex = commandIndex;
    }
    this.events.onFinishCommand.emit({
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
    const block = this.config.blockMap[blockId];
    if (!block) {
      return;
    }
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.satisfiedTriggers = satisfiedTriggers;
      blockState.unsatisfiedTriggers = unsatisfiedTriggers;
      this.events.onCheckTriggers.emit({
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
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.executingIndex = index;
    }
    this.events.onGoToCommandIndex.emit({ blockId, index, from, line });
  }

  commandJumpStackPush(
    blockId: string,
    indices: number[],
    from?: number,
    line?: number
  ): void {
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      blockState.commandJumpStack.unshift(...indices);
    }
    this.events.onCommandJumpStackPush.emit({ blockId, indices, from, line });
  }

  commandJumpStackPop(
    blockId: string,
    from?: number,
    line?: number
  ): number | undefined {
    const blockState = this.state.blockStates[blockId];
    if (blockState) {
      const index = blockState.commandJumpStack.shift();
      this.events.onCommandJumpStackPop.emit({ blockId, from, line });
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
    if (!this.state.variableStates[variableId]) {
      this.state.changedVariables.push(variableId);
    }
    const variableState = this.state.variableStates[variableId] || {
      name: variableId.split(".").slice(-1).join(""),
      value: value,
    };
    variableState.value = value;
    this.state.variableStates[variableId] = variableState;
    this.events.onSetVariableValue.emit({ variableId, value, from, line });
  }

  getRuntimeValue(id: string): unknown {
    const variableState = this.state.variableStates?.[id];
    if (variableState) {
      return variableState.value;
    }
    const blockState = this.state.blockStates?.[id];
    if (blockState) {
      return blockState.executionCount;
    }
    return undefined;
  }

  setRuntimeValue(id: string, value: unknown): void {
    this.setVariableValue(id, value);
  }
}
