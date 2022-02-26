import { BlockState, createBlockState } from "../../interfaces/blockState";
import { TriggerState } from "../../interfaces/triggerState";
import { VariableState } from "../../interfaces/variableState";
import { GameEvent } from "../events/gameEvent";
import { Manager } from "./manager";

export interface LogicState {
  blockStates: { [blockId: string]: BlockState };
  variableStates: { [variableId: string]: VariableState };
  triggerStates: { [triggerId: string]: TriggerState };
  activeParentBlock: string;
  activeChildBlocks: string[];
  activeCommandIndex: number;
}

export interface LogicEvents {
  onLoadBlock: GameEvent<{ pos: number; line: number; id: string }>;
  onUnloadBlock: GameEvent<{ pos: number; line: number; id: string }>;
  onUpdateBlock: GameEvent<{
    pos: number;
    line: number;
    id: string;
    time: number;
    delta: number;
  }>;
  onChangeActiveParentBlock: GameEvent<{
    pos: number;
    line: number;
    id: string;
  }>;
  onExecuteBlock: GameEvent<{
    pos: number;
    line: number;
    id: string;
    executedByBlockId: string;
  }>;
  onFinishBlock: GameEvent<{
    pos: number;
    line: number;
    id: string;
    executedByBlockId: string;
  }>;
  onEnterBlock: GameEvent<{ pos: number; line: number; id: string }>;
  onExitBlock: GameEvent<{ pos: number; line: number; id: string }>;
  onCheckTriggers: GameEvent<{
    pos: number;
    line: number;
    blockId: string;
    shouldExecute: boolean;
    satisfiedTriggers: string[];
    unsatisfiedTriggers: string[];
  }>;
  onExecuteCommand: GameEvent<{
    pos: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onFinishCommand: GameEvent<{
    pos: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onGoToCommandIndex: GameEvent<{
    pos: number;
    line: number;
    blockId: string;
    index: number;
  }>;
  onCommandJumpStackPush: GameEvent<{
    pos: number;
    line: number;
    blockId: string;
    indices: number[];
  }>;
  onCommandJumpStackPop: GameEvent<{
    pos: number;
    line: number;
    blockId: string;
  }>;
  onSetVariableValue: GameEvent<{
    pos: number;
    line: number;
    id: string;
    value: unknown;
  }>;
  onSetTriggerValue: GameEvent<{
    pos: number;
    line: number;
    id: string;
    value: unknown;
  }>;
}

export class LogicManager extends Manager<LogicState, LogicEvents> {
  private _blockTree: {
    [blockId: string]: {
      index: number;
      pos: number;
      line: number;
      triggerable: boolean;
      parent: string;
      children: string[];
    };
  };

  public get blockTree(): {
    [blockId: string]: {
      index: number;
      pos: number;
      line: number;
      triggerable: boolean;
      parent: string;
      children: string[];
    };
  } {
    return this._blockTree;
  }

  constructor(
    blockTree: {
      [blockId: string]: {
        index: number;
        pos: number;
        line: number;
        triggerable: boolean;
        parent: string;
        children: string[];
      };
    },
    state?: LogicState
  ) {
    super(state);
    this._blockTree = blockTree;
  }

  getInitialState(): LogicState {
    return {
      activeParentBlock: "",
      activeCommandIndex: 0,
      activeChildBlocks: [],
      blockStates: {},
      variableStates: {},
      triggerStates: {},
    };
  }

  getInitialEvents(): LogicEvents {
    return {
      onLoadBlock: new GameEvent<{ id: string; pos: number; line: number }>(),
      onUnloadBlock: new GameEvent<{
        pos: number;
        line: number;
        id: string;
      }>(),
      onUpdateBlock: new GameEvent<{
        pos: number;
        line: number;
        id: string;
        time: number;
        delta: number;
      }>(),
      onExecuteBlock: new GameEvent<{
        pos: number;
        line: number;
        id: string;
        executedByBlockId: string;
      }>(),
      onFinishBlock: new GameEvent<{
        pos: number;
        line: number;
        id: string;
        executedByBlockId: string;
      }>(),
      onChangeActiveParentBlock: new GameEvent<{
        pos: number;
        line: number;
        id: string;
      }>(),
      onEnterBlock: new GameEvent<{
        pos: number;
        line: number;
        id: string;
      }>(),
      onExitBlock: new GameEvent<{
        pos: number;
        line: number;
        id: string;
      }>(),
      onCheckTriggers: new GameEvent<{
        pos: number;
        line: number;
        blockId: string;
        shouldExecute: boolean;
        satisfiedTriggers: string[];
        unsatisfiedTriggers: string[];
      }>(),
      onExecuteCommand: new GameEvent<{
        pos: number;
        line: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onFinishCommand: new GameEvent<{
        pos: number;
        line: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onGoToCommandIndex: new GameEvent<{
        pos: number;
        line: number;
        blockId: string;
        index: number;
      }>(),
      onCommandJumpStackPush: new GameEvent<{
        pos: number;
        line: number;
        blockId: string;
        indices: number[];
      }>(),
      onCommandJumpStackPop: new GameEvent<{
        pos: number;
        line: number;
        blockId: string;
      }>(),
      onSetVariableValue: new GameEvent<{
        pos: number;
        line: number;
        id: string;
        value: unknown;
      }>(),
      onSetTriggerValue: new GameEvent<{
        pos: number;
        line: number;
        id: string;
        value: unknown;
      }>(),
    };
  }

  getSaveData(): LogicState {
    const saveState = this.deepCopyState(this.state);
    const validBlockStates: { [blockId: string]: BlockState } = {};
    Object.keys(this.state.blockStates).forEach((blockId) => {
      if (this.blockTree[blockId]) {
        validBlockStates[blockId] = this.state.blockStates[blockId];
      }
    });
    saveState.blockStates = validBlockStates;
    return saveState;
  }

  start(): void {
    this.enterBlock({ id: this.state.activeParentBlock });
    this.executeBlock({
      id: this.state.activeParentBlock,
      executedByBlockId: null,
      startIndex: this.state.activeCommandIndex,
    });
    super.start();
  }

  private changeActiveParentBlock(newParentBlockId: string): void {
    this.unloadAllBlocks();
    this.state.activeParentBlock = newParentBlockId;
    const parent = this.blockTree?.[newParentBlockId];
    const childIds = parent?.children || [];
    this.loadBlocks({ ids: [newParentBlockId, ...childIds] });
    this.events.onChangeActiveParentBlock.emit({
      pos: parent?.pos,
      line: parent?.line,
      id: newParentBlockId,
    });
  }

  private resetBlockExecution(id: string): void {
    const blockState = this.state.blockStates[id] || createBlockState();
    blockState.executedBy = "";
    blockState.isExecuting = false;
    blockState.hasFinished = false;
    blockState.previousIndex = -1;
    blockState.executingIndex = 0;
    blockState.commandJumpStack = [];
    blockState.lastExecutedAt = -1;
    blockState.time = -1;
    blockState.delta = -1;
    this.state.blockStates[id] = blockState;
  }

  loadBlock(data: { id: string }): void {
    if (this.state.activeChildBlocks.includes(data.id)) {
      return;
    }
    this.state.activeChildBlocks.push(data.id);
    const blockState = this.state.blockStates[data.id] || createBlockState();
    blockState.active = true;
    this.state.blockStates[data.id] = blockState;
    const block = this.blockTree[data.id];
    this.events.onLoadBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  loadBlocks(data: { ids: string[] }): void {
    data.ids.map((id) => this.loadBlock({ id }));
  }

  unloadBlock(data: { id: string }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.active = false;
    if (!this.state.activeChildBlocks.includes(data.id)) {
      return;
    }
    this.state.activeChildBlocks = this.state.activeChildBlocks.filter(
      (id) => id !== data.id
    );
    const block = this.blockTree[data.id];
    this.events.onUnloadBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  unloadBlocks(data: { ids: string[] }): void {
    data.ids.map((id) => this.unloadBlock({ id }));
  }

  unloadAllBlocks(): void {
    this.unloadBlocks({ ids: this.state.activeChildBlocks.reverse() });
  }

  updateBlock(data: { id: string; time: number; delta: number }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.time = data.time;
    blockState.delta = data.delta;
    const block = this.blockTree[data.id];
    this.events.onUpdateBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  executeBlock(data: {
    id: string;
    executedByBlockId: string;
    startIndex?: number;
  }): void {
    this.resetBlockExecution(data.id);
    const blockState = this.state.blockStates[data.id];
    blockState.executionCount += 1;
    blockState.executedBy = data.executedByBlockId;
    blockState.isExecuting = true;
    blockState.startIndex = data.startIndex || 0;
    const block = this.blockTree[data.id];
    this.events.onExecuteBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  finishBlock(data: { id: string }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.isExecuting = false;
    blockState.hasFinished = true;
    const block = this.blockTree[data.id];
    this.events.onFinishBlock.emit({
      pos: block.pos,
      line: block.line,
      executedByBlockId: blockState.executedBy,
      ...data,
    });
  }

  continueToNextBlock(data: { id: string }): void {
    const blockId = data.id;
    const block = this.blockTree[blockId];
    if (block.triggerable) {
      return;
    }
    const blockList = Object.entries(this.blockTree).slice(block.index + 1);
    const [nextBlockId, nextBlock] = blockList.find(
      ([, v]) =>
        !v.triggerable &&
        (v.parent === blockId || this.blockTree[v.parent].index < block.index)
    ) || [undefined, undefined];
    if (nextBlock) {
      if (nextBlock?.children?.length > 0) {
        this.enterBlock({ id: nextBlockId });
      } else {
        this.enterBlock({ id: nextBlock.parent });
      }
      this.executeBlock({
        id: nextBlockId,
        executedByBlockId: data.id,
      });
    }
  }

  enterBlock(data: { id: string }): void {
    const currentParentBlockId = this.state.activeParentBlock;
    const blockState =
      this.state.blockStates[currentParentBlockId] || createBlockState();
    blockState.returnedFrom = "";
    blockState.hasReturned = false;
    const newParentBlockId = data.id;
    this.state.blockStates[currentParentBlockId] = blockState;
    this.changeActiveParentBlock(newParentBlockId);
    const block = this.blockTree[data.id];
    this.events.onEnterBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  exitBlock(): void {
    const currentParentBlockId = this.state.activeParentBlock;
    const newParentBlockId = this.blockTree[currentParentBlockId].parent;
    if (!newParentBlockId) {
      return;
    }
    const newParentBlockState = this.state.blockStates[newParentBlockId];
    newParentBlockState.returnedFrom = currentParentBlockId;
    newParentBlockState.hasReturned = true;
    this.changeActiveParentBlock(newParentBlockId);
    const childIds = this.blockTree[currentParentBlockId].children;
    childIds.map((id) => this.resetBlockExecution(id));
    const block = this.blockTree[currentParentBlockId];
    this.events.onExitBlock.emit({
      pos: block.pos,
      line: block.line,
      id: currentParentBlockId,
    });
  }

  executeCommand(data: {
    pos: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.lastExecutedAt = data.time;
    const currentExecutionCount =
      blockState.commandExecutionCounts[data.commandIndex] || 0;
    blockState.commandExecutionCounts[data.commandIndex] =
      currentExecutionCount;
    this.events.onExecuteCommand.emit({ ...data });
    if (blockState.startIndex <= blockState.executingIndex) {
      blockState.startIndex = 0;
    }
  }

  finishCommand(data: {
    pos: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.lastExecutedAt = -1;
    blockState.previousIndex = data.commandIndex;
    const currentExecutionCount =
      blockState.commandExecutionCounts[data.commandIndex] || 0;
    blockState.commandExecutionCounts[data.commandIndex] =
      currentExecutionCount + 1;
    this.events.onFinishCommand.emit({ ...data });
  }

  checkTriggers(data: {
    blockId: string;
    shouldExecute: boolean;
    satisfiedTriggers: string[];
    unsatisfiedTriggers: string[];
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.satisfiedTriggers = data.satisfiedTriggers;
    blockState.unsatisfiedTriggers = data.unsatisfiedTriggers;
    const block = this.blockTree[data.blockId];
    this.events.onCheckTriggers.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  goToCommandIndex(data: {
    pos: number;
    line: number;
    blockId: string;
    index: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.executingIndex = data.index;
    this.events.onGoToCommandIndex.emit({ ...data });
  }

  commandJumpStackPush(data: {
    pos: number;
    line: number;
    blockId: string;
    indices: number[];
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.commandJumpStack.unshift(...data.indices);
    this.events.onCommandJumpStackPush.emit({ ...data });
  }

  commandJumpStackPop(data: {
    pos: number;
    line: number;
    blockId: string;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.commandJumpStack.shift();
    this.events.onCommandJumpStackPop.emit({ ...data });
  }

  setVariableValue(data: {
    pos: number;
    line: number;
    id: string;
    value: unknown;
  }): void {
    const variableState = this.state.variableStates[data.id] || {
      value: data.value,
    };
    variableState.value = data.value;
    this.state.variableStates[data.id] = variableState;
    this.events.onSetVariableValue.emit({ ...data });
  }

  setTriggerValue(data: {
    pos: number;
    line: number;
    id: string;
    value: unknown;
  }): void {
    const triggerState = this.state.triggerStates[data.id] || {
      value: data.value,
      executionCount: 0,
    };
    triggerState.value = data.value;
    triggerState.executionCount += 1;
    this.state.triggerStates[data.id] = triggerState;
    this.events.onSetTriggerValue.emit({ ...data });
  }
}
