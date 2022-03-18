import { Block } from "../../interfaces/block";
import { BlockState, createBlockState } from "../../interfaces/blockState";
import { VariableState } from "../../interfaces/variableState";
import { GameEvent } from "../events/gameEvent";
import { Manager } from "./manager";

export interface LogicState {
  activeParentBlockId: string;
  activeCommandIndex: number;
  loadedBlockIds: string[];
  loadedAssetIds: string[];
  blockStates: { [blockId: string]: BlockState };
  variableStates: { [variableId: string]: VariableState };
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
  onReturnFromBlock: GameEvent<{ pos: number; line: number; id: string }>;
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
  onLoadAsset: GameEvent<{
    id: string;
  }>;
  onUnloadAsset: GameEvent<{
    id: string;
  }>;
}

export class LogicManager extends Manager<LogicState, LogicEvents> {
  private _blockTree: Record<string, Block>;

  public get blockTree(): Record<string, Block> {
    return this._blockTree;
  }

  constructor(blockTree: Record<string, Block>, state?: LogicState) {
    super(state);
    this._blockTree = blockTree;
  }

  getInitialState(): LogicState {
    return {
      activeParentBlockId: "",
      activeCommandIndex: 0,
      loadedBlockIds: [],
      loadedAssetIds: [],
      blockStates: {},
      variableStates: {},
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
      onReturnFromBlock: new GameEvent<{
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
      onLoadAsset: new GameEvent<{
        id: string;
      }>(),
      onUnloadAsset: new GameEvent<{
        id: string;
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
    this.enterBlock({
      id: this.state.activeParentBlockId,
      returnWhenFinished: false,
      executedByBlockId: null,
      startIndex: this.state.activeCommandIndex,
    });
    super.start();
  }

  private changeActiveParentBlock(newParentBlockId: string): void {
    if (this.state.activeParentBlockId === newParentBlockId) {
      return;
    }
    this.state.activeParentBlockId = newParentBlockId;
    const parent = this.blockTree?.[newParentBlockId];
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

  private getReferencedAssets(): string[] {
    const id = this.state.activeParentBlockId;
    const referencedAssets = new Set<string>();
    const block = this.blockTree[id];
    block.children.forEach((childId) => {
      const childBlock = this.blockTree[childId];
      childBlock.assets.forEach((a) => {
        referencedAssets.add(a);
      });
    });
    this.blockTree[id].assets.forEach((a) => {
      referencedAssets.add(a);
    });
    let blockId = id;
    while (blockId) {
      blockId = this.blockTree[blockId].parent;
      this.blockTree[blockId].assets.forEach((a) => {
        referencedAssets.add(a);
      });
    }
    return Array.from(referencedAssets);
  }

  private loadAsset(data: { id: string }): void {
    if (this.state.loadedAssetIds.includes(data.id)) {
      return;
    }
    this.state.loadedAssetIds.push(data.id);

    this.events.onLoadAsset.emit(data);
  }

  private unloadAsset(data: { id: string }): void {
    if (!this.state.loadedAssetIds.includes(data.id)) {
      return;
    }
    this.state.loadedAssetIds = this.state.loadedAssetIds.filter(
      (id) => id !== data.id
    );

    this.events.onUnloadAsset.emit(data);
  }

  private loadBlock(data: { id: string }): void {
    if (this.state.loadedBlockIds.includes(data.id)) {
      return;
    }
    this.state.loadedBlockIds.push(data.id);

    const blockState = this.state.blockStates[data.id] || createBlockState();
    this.state.blockStates[data.id] = blockState;
    if (blockState.loaded) {
      return;
    }
    blockState.loaded = true;

    const block = this.blockTree[data.id];
    this.events.onLoadBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  private loadBlocks(data: { ids: string[] }): void {
    data.ids.map((id) => this.loadBlock({ id }));
  }

  private unloadBlock(data: { id: string }): void {
    if (!this.state.loadedBlockIds.includes(data.id)) {
      return;
    }
    this.state.loadedBlockIds = this.state.loadedBlockIds.filter(
      (id) => id !== data.id
    );
    const blockState = this.state.blockStates[data.id];
    if (!blockState?.loaded) {
      return;
    }
    blockState.loaded = false;
    const block = this.blockTree[data.id];
    this.events.onUnloadBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
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

  private continueToNextBlock(data: { id: string }): void {
    const blockId = data.id;
    const block = this.blockTree[blockId];
    if (block.operator) {
      return;
    }
    const blockList = Object.entries(this.blockTree).slice(block.index + 1);
    const [nextBlockId, nextBlock] = blockList.find(
      ([, v]) =>
        !v.operator &&
        (v.parent === blockId || this.blockTree[v.parent].index < block.index)
    ) || [undefined, undefined];
    if (nextBlock) {
      this.enterBlock({
        id: nextBlockId,
        returnWhenFinished: false,
        executedByBlockId: data.id,
      });
    }
  }

  continue(data: { id: string }): void {
    const blockId = data.id;
    const blockState = this.state.blockStates[blockId];
    if (blockState.returnWhenFinished) {
      this.returnFromBlock({ ...data, value: "" });
    } else {
      this.continueToNextBlock(data);
    }
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

  enterBlock(data: {
    id: string;
    returnWhenFinished: boolean;
    executedByBlockId: string;
    startIndex?: number;
  }): void {
    console.warn(data.id);
    const blockState = this.state.blockStates[data.id] || createBlockState();
    if (data.returnWhenFinished) {
      blockState.hasReturned = false;
      blockState.returnedFrom = "";
    }
    this.state.blockStates[data.id] = blockState;

    // Change activeParent
    const newActiveParent = this.blockTree[data.id].parent;
    this.changeActiveParentBlock(newActiveParent);

    // Unload all loaded blocks that are not an ancestor of activeParent
    this.state.loadedBlockIds.forEach((loadedBlockId) => {
      if (!newActiveParent.startsWith(loadedBlockId)) {
        this.unloadBlock({ id: loadedBlockId });
        this.resetBlockExecution(loadedBlockId);
      }
    });
    const parent = this.blockTree?.[newActiveParent];
    const childIds = parent?.children || [];
    const referencedAssets = this.getReferencedAssets();
    // Unload unreferenced assets
    this.state.loadedAssetIds.forEach((loadedAssetId) => {
      if (!referencedAssets.includes(loadedAssetId)) {
        this.unloadAsset({ id: loadedAssetId });
      }
    });

    // Load referenced assets
    referencedAssets.forEach((assetId) => {
      this.loadAsset({ id: assetId });
    });
    // Load activeParent and immediate child blocks
    this.loadBlocks({ ids: [newActiveParent, ...childIds] });

    // Execute activeParent
    this.executeBlock(data);

    const block = this.blockTree[data.id];
    this.events.onEnterBlock.emit({
      pos: block.pos,
      line: block.line,
      ...data,
    });
  }

  returnFromBlock(data: {
    id: string;
    value: string | number | boolean;
  }): void {
    const executedByBlockId = this.state.blockStates[data.id]?.executedBy;
    if (!executedByBlockId) {
      return;
    }

    const block = this.blockTree[data.id];
    const variableId = `${data.id}.return`;
    this.setVariableValue({
      pos: block.pos,
      line: block.line,
      id: variableId,
      value: data.value,
    });

    const executedByBlockState = this.state.blockStates[executedByBlockId];
    this.enterBlock({
      id: executedByBlockId,
      returnWhenFinished: executedByBlockState.returnWhenFinished,
      executedByBlockId: executedByBlockState.executedBy,
      startIndex: executedByBlockState.executingIndex,
    });
    executedByBlockState.hasReturned = true;
    executedByBlockState.returnedFrom = data.id;

    this.events.onReturnFromBlock.emit({
      pos: block.pos,
      line: block.line,
      id: data.id,
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
    value: string | number | boolean;
  }): void {
    const variableState = this.state.variableStates[data.id] || {
      value: data.value,
    };
    variableState.value = data.value;
    this.state.variableStates[data.id] = variableState;
    this.events.onSetVariableValue.emit({ ...data });
  }
}
