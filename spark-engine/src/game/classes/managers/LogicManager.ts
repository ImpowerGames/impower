import { Block } from "../../interfaces/Block";
import { BlockState } from "../../interfaces/BlockState";
import { VariableState } from "../../interfaces/VariableState";
import { createBlockState } from "../../utils/createBlockState";
import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

export interface LogicState {
  activeParentBlockId: string;
  activeCommandIndex: number;
  loadedBlockIds: string[];
  loadedAssetIds: string[];
  blockStates: { [blockId: string]: BlockState };
  variableStates: { [variableId: string]: VariableState };
}

export interface LogicEvents {
  onLoadBlock: GameEvent<{ from: number; line: number; id: string }>;
  onUnloadBlock: GameEvent<{ from: number; line: number; id: string }>;
  onUpdateBlock: GameEvent<{
    from: number;
    line: number;
    id: string;
    time: number;
    delta: number;
  }>;
  onChangeActiveParentBlock: GameEvent<{
    from: number;
    line: number;
    id: string;
  }>;
  onExecuteBlock: GameEvent<{
    from: number;
    line: number;
    id: string;
    executedByBlockId: string | null;
    value: number;
  }>;
  onFinishBlock: GameEvent<{
    from: number;
    line: number;
    id: string;
    executedByBlockId: string | null;
  }>;
  onEnterBlock: GameEvent<{ from: number; line: number; id: string }>;
  onStopBlock: GameEvent<{ from: number; line: number; id: string }>;
  onReturnFromBlock: GameEvent<{ from: number; line: number; id: string }>;
  onCheckTriggers: GameEvent<{
    from: number;
    line: number;
    blockId: string;
    shouldExecute: boolean;
    satisfiedTriggers: string[];
    unsatisfiedTriggers: string[];
  }>;
  onExecuteCommand: GameEvent<{
    from: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onChooseChoice: GameEvent<{
    from: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
  }>;
  onFinishCommand: GameEvent<{
    from: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }>;
  onGoToCommandIndex: GameEvent<{
    from: number;
    line: number;
    blockId: string;
    index: number;
  }>;
  onCommandJumpStackPush: GameEvent<{
    from: number;
    line: number;
    blockId: string;
    indices: number[];
  }>;
  onCommandJumpStackPop: GameEvent<{
    from: number;
    line: number;
    blockId: string;
  }>;
  onSetVariableValue: GameEvent<{
    from: number;
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
  private _blockMap: Record<string, Block>;

  public get blockMap(): Record<string, Block> {
    return this._blockMap;
  }

  constructor(blockMap: Record<string, Block>, state?: LogicState) {
    super(state);
    this._blockMap = blockMap;
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
      onLoadBlock: new GameEvent<{ id: string; from: number; line: number }>(),
      onUnloadBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
      }>(),
      onUpdateBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
        time: number;
        delta: number;
      }>(),
      onExecuteBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
        executedByBlockId: string | null;
        value: number;
      }>(),
      onFinishBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
        executedByBlockId: string | null;
      }>(),
      onChangeActiveParentBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
      }>(),
      onEnterBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
      }>(),
      onStopBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
      }>(),
      onReturnFromBlock: new GameEvent<{
        from: number;
        line: number;
        id: string;
      }>(),
      onCheckTriggers: new GameEvent<{
        from: number;
        line: number;
        blockId: string;
        shouldExecute: boolean;
        satisfiedTriggers: string[];
        unsatisfiedTriggers: string[];
      }>(),
      onExecuteCommand: new GameEvent<{
        from: number;
        line: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onChooseChoice: new GameEvent<{
        from: number;
        line: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
      }>(),
      onFinishCommand: new GameEvent<{
        from: number;
        line: number;
        blockId: string;
        commandId: string;
        commandIndex: number;
        time: number;
      }>(),
      onGoToCommandIndex: new GameEvent<{
        from: number;
        line: number;
        blockId: string;
        index: number;
      }>(),
      onCommandJumpStackPush: new GameEvent<{
        from: number;
        line: number;
        blockId: string;
        indices: number[];
      }>(),
      onCommandJumpStackPop: new GameEvent<{
        from: number;
        line: number;
        blockId: string;
      }>(),
      onSetVariableValue: new GameEvent<{
        from: number;
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
      if (this.blockMap[blockId]) {
        validBlockStates[blockId] = this.state.blockStates[blockId];
      }
    });
    saveState.blockStates = validBlockStates;
    return saveState;
  }

  init(): void {
    this.enterBlock({
      id: this.state.activeParentBlockId,
      returnWhenFinished: false,
      executedByBlockId: null,
      startIndex: this.state.activeCommandIndex,
    });
    super.init();
  }

  private changeActiveParentBlock(newParentBlockId: string): void {
    if (this.state.activeParentBlockId === newParentBlockId) {
      return;
    }
    this.state.activeParentBlockId = newParentBlockId;
    const parent = this.blockMap?.[newParentBlockId];
    this.events.onChangeActiveParentBlock.emit({
      from: parent?.from,
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

    const block = this.blockMap[data.id];
    this.events.onLoadBlock.emit({
      from: block.from,
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
    const block = this.blockMap[data.id];
    this.events.onUnloadBlock.emit({
      from: block.from,
      line: block.line,
      ...data,
    });
  }

  updateBlock(data: { id: string; time: number; delta: number }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.time = data.time;
    blockState.delta = data.delta;
    const block = this.blockMap[data.id];
    this.events.onUpdateBlock.emit({
      from: block.from,
      line: block.line,
      ...data,
    });
  }

  executeBlock(data: {
    id: string;
    executedByBlockId: string | null;
    startIndex?: number;
  }): void {
    this.resetBlockExecution(data.id);
    const blockState = this.state.blockStates[data.id];
    blockState.executionCount += 1;
    blockState.executedBy = data.executedByBlockId;
    blockState.isExecuting = true;
    blockState.startIndex = data.startIndex || 0;
    const block = this.blockMap[data.id];
    this.events.onExecuteBlock.emit({
      from: block.from,
      line: block.line,
      value: blockState.executionCount,
      ...data,
    });
  }

  getNextBlockId(id: string): string | null | undefined {
    const block = this.blockMap[id];
    if (block.type !== "section") {
      return null;
    }
    const blockList = Object.entries(this.blockMap).slice(block.index + 1);
    const [nextBlockId] = blockList.find(
      ([, v]) =>
        v.type === "section" &&
        (v.parent === id || this.blockMap[v.parent || ""].index < block.index)
    ) || [undefined, undefined];
    return nextBlockId;
  }

  private continueToNextBlock(data: { id: string }): boolean {
    const nextBlockId = this.getNextBlockId(data.id);
    if (!nextBlockId) {
      return false;
    }
    this.enterBlock({
      id: nextBlockId,
      returnWhenFinished: false,
      executedByBlockId: data.id,
    });
    return true;
  }

  continue(data: { id: string }): boolean {
    const blockId = data.id;
    const blockState = this.state.blockStates[blockId];
    if (blockState.returnWhenFinished) {
      return this.returnFromBlock({ ...data, value: "" });
    }
    return this.continueToNextBlock(data);
  }

  finishBlock(data: { id: string }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.isExecuting = false;
    blockState.hasFinished = true;
    const block = this.blockMap[data.id];
    this.events.onFinishBlock.emit({
      from: block.from,
      line: block.line,
      executedByBlockId: blockState.executedBy,
      ...data,
    });
  }

  enterBlock(data: {
    id: string;
    returnWhenFinished: boolean;
    executedByBlockId: string | null;
    startIndex?: number;
  }): void {
    if (!this.blockMap[data.id]) {
      return;
    }
    const blockState = this.state.blockStates[data.id] || createBlockState();
    if (data.returnWhenFinished) {
      blockState.hasReturned = false;
      blockState.returnedFrom = "";
    }
    this.state.blockStates[data.id] = blockState;

    // Change activeParent
    const newActiveParent = data.id;
    this.changeActiveParentBlock(newActiveParent);

    // Unload all loaded blocks that are not an ancestor or direct child of new activeParent
    this.state.loadedBlockIds.forEach((loadedBlockId) => {
      const loadedBlockParent = loadedBlockId.split(".").slice(0, -1).join(".");
      if (
        !newActiveParent.startsWith(loadedBlockId) &&
        newActiveParent !== loadedBlockParent
      ) {
        this.unloadBlock({ id: loadedBlockId });
        this.resetBlockExecution(loadedBlockId);
      }
    });
    const parent = this.blockMap?.[newActiveParent];
    const childIds = parent?.children || [];
    // Load activeParent and immediate child blocks
    this.loadBlocks({ ids: [newActiveParent, ...childIds] });

    // Execute activeParent
    this.executeBlock(data);

    const block = this.blockMap[data.id];
    this.events.onEnterBlock.emit({
      from: block.from,
      line: block.line,
      ...data,
    });
  }

  stopBlock(data: { id: string }): void {
    const blockState = this.state.blockStates[data.id];
    blockState.isExecuting = false;
    const block = this.blockMap[data.id];
    this.events.onStopBlock.emit({
      from: block.from,
      line: block.line,
      ...data,
    });
  }

  returnFromBlock(data: { id: string; value: unknown }): boolean {
    const blockState = this.state.blockStates[data.id];
    blockState.isExecuting = false;
    blockState.hasFinished = true;

    const executedByBlockId = this.state.blockStates[data.id]?.executedBy;
    if (!executedByBlockId) {
      return false;
    }

    const block = this.blockMap[data.id];
    const variableId = `${data.id}.return`;
    this.setVariableValue({
      from: block.from,
      line: block.line,
      id: variableId,
      value: data.value,
    });

    const executedByBlockState = this.state.blockStates[executedByBlockId];
    this.enterBlock({
      id: executedByBlockId,
      returnWhenFinished: executedByBlockState.returnWhenFinished,
      executedByBlockId: executedByBlockState.executedBy,
      startIndex: executedByBlockState.executingIndex + 1,
    });
    executedByBlockState.hasReturned = true;
    executedByBlockState.returnedFrom = data.id;

    this.events.onReturnFromBlock.emit({
      from: block.from,
      line: block.line,
      id: data.id,
    });

    return true;
  }

  chooseChoice(data: {
    from: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
  }): number {
    const blockState = this.state.blockStates[data.blockId];
    const currentCount = blockState.choiceChosenCounts[data.commandId] || 0;
    const newCount = currentCount + 1;
    blockState.choiceChosenCounts[data.commandId] = newCount;
    this.events.onChooseChoice.emit({ ...data });
    return newCount;
  }

  executeCommand(data: {
    from: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.lastExecutedAt = data.time;
    const currentCount = blockState.commandExecutionCounts[data.commandId] || 0;
    blockState.commandExecutionCounts[data.commandId] = currentCount + 1;
    if (blockState.startIndex <= blockState.executingIndex) {
      blockState.startIndex = 0;
    }
    this.events.onExecuteCommand.emit({ ...data });
  }

  finishCommand(data: {
    from: number;
    line: number;
    blockId: string;
    commandId: string;
    commandIndex: number;
    time: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.lastExecutedAt = -1;
    blockState.previousIndex = data.commandIndex;
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
    const block = this.blockMap[data.blockId];
    this.events.onCheckTriggers.emit({
      from: block.from,
      line: block.line,
      ...data,
    });
  }

  goToCommandIndex(data: {
    from: number;
    line: number;
    blockId: string;
    index: number;
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.executingIndex = data.index;
    this.events.onGoToCommandIndex.emit({ ...data });
  }

  commandJumpStackPush(data: {
    from: number;
    line: number;
    blockId: string;
    indices: number[];
  }): void {
    const blockState = this.state.blockStates[data.blockId];
    blockState.commandJumpStack.unshift(...data.indices);
    this.events.onCommandJumpStackPush.emit({ ...data });
  }

  commandJumpStackPop(data: {
    from: number;
    line: number;
    blockId: string;
  }): number | undefined {
    const blockState = this.state.blockStates[data.blockId];
    const index = blockState.commandJumpStack.shift();
    this.events.onCommandJumpStackPop.emit({ ...data });
    return index;
  }

  setVariableValue(data: {
    from: number;
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
}
