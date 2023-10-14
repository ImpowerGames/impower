import { GameEvent } from "../../core/classes/GameEvent";
import { GameEvent2 } from "../../core/classes/GameEvent2";
import { Manager } from "../../core/classes/Manager";
import { Block } from "../types/Block";
import { BlockState } from "../types/BlockState";
import { DocumentSource } from "../types/DocumentSource";
import { VariableState } from "../types/VariableState";
import { createBlockState } from "../utils/createBlockState";

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
  onSetVariableValue: GameEvent2<string, DocumentSource | undefined>;
  onLoadAsset: GameEvent2<string, DocumentSource | undefined>;
  onUnloadAsset: GameEvent2<string, DocumentSource | undefined>;
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
  blockStates: Record<string, BlockState>;
  variableStates: Record<string, VariableState>;
}

export class LogicManager extends Manager<
  LogicEvents,
  LogicConfig,
  LogicState
> {
  constructor(config?: Partial<LogicConfig>, state?: Partial<LogicState>) {
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
    const parent = this._config.blockMap?.[newParentBlockId]!;
    this._events.onChangeActiveParentBlock.dispatch(
      newParentBlockId,
      parent.source
    );
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
    blockState.isExecutingCommand = false;
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

  updateBlock(blockId: string): void {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return;
    }
    this._events.onUpdateBlock.dispatch(blockId, block.source);
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
    this._events.onExecuteBlock.dispatch(blockId, block.source);
  }

  getNextBlockId(blockId: string): string | null | undefined {
    const block = this._config.blockMap[blockId];
    if (!block) {
      return undefined;
    }
    const blockIds = Object.keys(this._config.blockMap);
    return blockIds[block.index + 1];
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

    this._events.onEnterBlock.dispatch(blockId, block.source);
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
    this.setVariableValue(variableId, value, block.source);

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

    this._events.onReturnFromBlock.dispatch(blockId, block.source);

    return true;
  }

  chooseChoice(
    blockId: string,
    commandId: string,
    source?: DocumentSource
  ): number {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      const currentCount = blockState.choiceChosenCounts[commandId] || 0;
      const newCount = currentCount + 1;
      blockState.choiceChosenCounts[commandId] = newCount;
      this._events.onChooseChoice.dispatch(commandId, source);
      return newCount;
    }
    return -1;
  }

  executeCommand(
    blockId: string,
    commandId: string,
    source?: DocumentSource
  ): void {
    const blockState = this._state.blockStates[blockId];
    if (blockState) {
      blockState.isExecutingCommand = true;
      const currentCount = blockState.commandExecutionCounts[commandId] || 0;
      blockState.commandExecutionCounts[commandId] = currentCount + 1;
      if (blockState.startIndex <= blockState.executingIndex) {
        blockState.startIndex = 0;
      }
    }
    this._events.onExecuteCommand.dispatch(commandId, source);
  }

  finishCommand(
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

  goToCommandIndex(
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

  commandJumpStackPush(
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

  commandJumpStackPop(
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

  setVariableValue(
    variableId: string,
    value: unknown,
    source?: DocumentSource
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
    this._events.onSetVariableValue.dispatch(variableId, source);
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
}
