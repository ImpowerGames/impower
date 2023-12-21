import { BlockState } from "../types/BlockState";

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
  startIndex: 0,
  executingIndex: 0,
  previousIndex: 0,
  commandJumpStack: [],
  isExecutingCommand: false,
  ...(obj || {}),
});
