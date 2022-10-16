import { BlockState } from "../interfaces/BlockState";

export const createBlockState = (
  id: string,
  obj?: Partial<BlockState>
): BlockState => ({
  name: id.split(".").slice(-1).join(""),
  loaded: false,
  executionCount: 0,
  commandExecutionCounts: {},
  choiceChosenCounts: {},
  executedBy: "",
  returnWhenFinished: false,
  returnedFrom: "",
  isExecuting: false,
  hasFinished: false,
  hasReturned: false,
  satisfiedTriggers: [],
  unsatisfiedTriggers: [],
  startIndex: 0,
  executingIndex: 0,
  previousIndex: 0,
  commandJumpStack: [],
  lastExecutedAt: -1,
  time: -1,
  delta: -1,
  ...(obj || {}),
});