import { Manager } from "./manager";
import { GameEvent } from "../events/gameEvent";
import { BlockState, createBlockState } from "../../interfaces/blockState";
import { VariableState } from "../../interfaces/variableState";
import { TriggerState } from "../../interfaces/triggerState";

export interface LogicState {
  blockStates: { [blockId: string]: BlockState };
  variableStates: { [variableId: string]: VariableState };
  triggerStates: { [triggerId: string]: TriggerState };
  activeParentBlockId: string;
  activeBlockIds: string[];
}

export interface LogicEvents {
  onLoadBlock: GameEvent<{ id: string }>;
  onUnloadBlock: GameEvent<{ id: string }>;
  onUpdateBlock: GameEvent<{ id: string; time: number; delta: number }>;
  onChangeActiveParentBlock: GameEvent<{ id: string }>;
  onExecuteBlock: GameEvent<{ id: string; executedByBlockId: string }>;
  onFinishBlock: GameEvent<{ id: string; executedByBlockId: string }>;
  onEnterBlock: GameEvent<{ id: string }>;
  onExitBlock: GameEvent<{ id: string }>;
  onCheckTriggers: GameEvent<{
    blockId: string;
    shouldExecute: boolean;
    satisfiedTriggers: string[];
    unsatisfiedTriggers: string[];
  }>;
  onExecuteCommand: GameEvent<{
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onFinishCommand: GameEvent<{
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onGoToCommandIndex: GameEvent<{ blockId: string; index: number }>;
  onCommandJumpStackPush: GameEvent<{ blockId: string; indices: number[] }>;
  onCommandJumpStackPop: GameEvent<{ blockId: string }>;
  onSetVariableValue: GameEvent<{ id: string; value: unknown }>;
  onSetTriggerValue: GameEvent<{ id: string; value: unknown }>;
  onEmptyPhaserClickDown: GameEvent<{ event: unknown }>;
  onEmptyPhaserClickUp: GameEvent<{ event: unknown }>;
}

export class LogicManager extends Manager<LogicState, LogicEvents> {
  private _blockTree: {
    [blockId: string]: { parent: string; children: string[] };
  };

  public get blockTree(): {
    [blockId: string]: { parent: string; children: string[] };
  } {
    return this._blockTree;
  }

  constructor(
    blockTree: { [blockId: string]: { parent: string; children: string[] } },
    state?: LogicState
  ) {
    super(state);
    this._blockTree = blockTree;
  }

  getInitialState(): LogicState {
    return {
      activeParentBlockId: "",
      blockStates: {},
      variableStates: {},
      triggerStates: {},
      activeBlockIds: [],
    };
  }

  getInitialEvents(): LogicEvents {
    return {
      onLoadBlock: new GameEvent<{ id: string }>(),
      onUnloadBlock: new GameEvent<{ id: string }>(),
      onUpdateBlock: new GameEvent<{
        id: string;
        time: number;
        delta: number;
      }>(),
      onExecuteBlock: new GameEvent<{
        id: string;
        executedByBlockId: string;
      }>(),
      onFinishBlock: new GameEvent<{ id: string; executedByBlockId: string }>(),
      onChangeActiveParentBlock: new GameEvent<{ id: string }>(),
      onEnterBlock: new GameEvent<{ id: string }>(),
      onExitBlock: new GameEvent<{ id: string }>(),
      onCheckTriggers: new GameEvent<{
        blockId: string;
        shouldExecute: boolean;
        satisfiedTriggers: string[];
        unsatisfiedTriggers: string[];
      }>(),
      onExecuteCommand: new GameEvent<{
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onFinishCommand: new GameEvent<{
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onGoToCommandIndex: new GameEvent<{ blockId: string; index: number }>(),
      onCommandJumpStackPush: new GameEvent<{
        blockId: string;
        indices: number[];
      }>(),
      onCommandJumpStackPop: new GameEvent<{
        blockId: string;
      }>(),
      onSetVariableValue: new GameEvent<{ id: string; value: unknown }>(),
      onSetTriggerValue: new GameEvent<{ id: string; value: unknown }>(),
      onEmptyPhaserClickDown: new GameEvent<{ event: unknown }>(),
      onEmptyPhaserClickUp: new GameEvent<{ event: unknown }>(),
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
    this.enterBlock({ id: this.state.activeParentBlockId });
    super.start();
  }

  private changeActiveParentBlock(newParentBlockId: string): void {
    this.unloadAllBlocks();
    this.state.activeParentBlockId = newParentBlockId;
    const childIds = this.blockTree?.[newParentBlockId]?.children || [];
    this.loadBlocks({ ids: childIds });
    this.events.onChangeActiveParentBlock.emit({ id: newParentBlockId });
  }

  private resetBlockExecution(id: string): void {
    const blockState = this.state.blockStates[id] || createBlockState();
    blockState.executedByBlockId = "";
    blockState.isExecuting = false;
    blockState.hasFinished = false;
    blockState.previousCommandIndex = -1;
    blockState.executingCommandIndex = 0;
    blockState.commandJumpStack = [];
    blockState.timeOfLastCommandExecution = -1;
    blockState.time = -1;
    blockState.delta = -1;
    this.state.blockStates[id] = blockState;
  }

  loadBlock(data: { id: string }): void {
    if (this.state.activeBlockIds.includes(data.id)) {
      return;
    }
    this.state.activeBlockIds.push(data.id);
    const blockState = this.state.blockStates[data.id] || createBlockState();
    blockState.active = true;
    this.state.blockStates[data.id] = blockState;
    this.events.onLoadBlock.emit({ ...data });
  }

  loadBlocks(data: { ids: string[] }): void {
    data.ids.map((id) => this.loadBlock({ id }));
  }

  unloadBlock(data: { id: string }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.active = false;
    if (!this.state.activeBlockIds.includes(data.id)) {
      return;
    }
    this.state.activeBlockIds = this.state.activeBlockIds.filter(
      (id) => id !== data.id
    );
    this.events.onUnloadBlock.emit({ ...data });
  }

  unloadBlocks(data: { ids: string[] }): void {
    data.ids.map((id) => this.unloadBlock({ id }));
  }

  unloadAllBlocks(): void {
    this.unloadBlocks({ ids: this.state.activeBlockIds.reverse() });
  }

  updateBlock(data: { id: string; time: number; delta: number }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.time = data.time;
    blockState.delta = data.delta;
    this.events.onUpdateBlock.emit({ ...data });
  }

  executeBlock(data: { id: string; executedByBlockId: string }): void {
    this.resetBlockExecution(data.id);
    const blockState = this.state.blockStates[data.id];
    blockState.executionCount += 1;
    blockState.executedByBlockId = data.executedByBlockId;
    blockState.isExecuting = true;
    this.events.onExecuteBlock.emit({ ...data });
  }

  finishBlock(data: { id: string }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.isExecuting = false;
    blockState.hasFinished = true;
    this.events.onFinishBlock.emit({
      ...data,
      executedByBlockId: blockState.executedByBlockId,
    });
  }

  enterBlock(data: { id: string }): void {
    const currentParentBlockId = this.state.activeParentBlockId;
    const blockState =
      this.state.blockStates[currentParentBlockId] || createBlockState();
    blockState.returnedFromBlockId = "";
    blockState.hasReturned = false;
    const newParentBlockId = data.id;
    this.state.blockStates[currentParentBlockId] = blockState;
    this.changeActiveParentBlock(newParentBlockId);
    this.events.onEnterBlock.emit({ ...data });
  }

  exitBlock(): void {
    const currentParentBlockId = this.state.activeParentBlockId;
    const newParentBlockId = this.blockTree[currentParentBlockId].parent;
    if (!newParentBlockId) {
      return;
    }
    const newParentBlockState = this.state.blockStates[newParentBlockId];
    newParentBlockState.returnedFromBlockId = currentParentBlockId;
    newParentBlockState.hasReturned = true;
    this.changeActiveParentBlock(newParentBlockId);
    const childIds = this.blockTree[currentParentBlockId].children;
    childIds.map((id) => this.resetBlockExecution(id));
    this.events.onExitBlock.emit({ id: currentParentBlockId });
  }

  executeCommand(data: {
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.timeOfLastCommandExecution = data.time;
    const currentExecutionCount =
      blockState.commandExecutionCounts[data.commandIndex] || 0;
    blockState.commandExecutionCounts[data.commandIndex] =
      currentExecutionCount;
    this.events.onExecuteCommand.emit({ ...data });
  }

  finishCommand(data: {
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.timeOfLastCommandExecution = -1;
    blockState.previousCommandIndex = data.commandIndex;
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
    this.events.onCheckTriggers.emit({ ...data });
  }

  goToCommandIndex(data: { blockId: string; index: number }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.executingCommandIndex = data.index;
    this.events.onGoToCommandIndex.emit({ ...data });
  }

  commandJumpStackPush(data: { blockId: string; indices: number[] }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.commandJumpStack.unshift(...data.indices);
    this.events.onCommandJumpStackPush.emit({ ...data });
  }

  commandJumpStackPop(data: { blockId: string }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.commandJumpStack.shift();
    this.events.onCommandJumpStackPop.emit({ ...data });
  }

  setVariableValue(data: { id: string; value: unknown }): void {
    const variableState = this.state.variableStates[data.id] || {
      value: data.value,
    };
    variableState.value = data.value;
    this.state.variableStates[data.id] = variableState;
    this.events.onSetVariableValue.emit({ ...data });
  }

  setTriggerValue(data: { id: string; value: unknown }): void {
    const triggerState = this.state.triggerStates[data.id] || {
      value: data.value,
      executionCount: 0,
    };
    triggerState.value = data.value;
    triggerState.executionCount += 1;
    this.state.triggerStates[data.id] = triggerState;
    this.events.onSetTriggerValue.emit({ ...data });
  }

  emptyPhaserClickDown(data: { event: unknown }): void {
    this.events.onEmptyPhaserClickDown.emit({ ...data });
  }

  emptyPhaserClickUp(data: { event: unknown }): void {
    this.events.onEmptyPhaserClickUp.emit({ ...data });
  }
}
