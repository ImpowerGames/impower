export interface BlockState {
  active: boolean;
  executionCount: number;
  commandExecutionCounts: number[];
  executedBy: string;
  returnedFrom: string;
  isExecuting: boolean;
  hasFinished: boolean;
  hasReturned: boolean;
  satisfiedTriggers: string[];
  unsatisfiedTriggers: string[];
  startIndex: number;
  executingIndex: number;
  previousIndex: number;
  commandJumpStack: number[];
  lastExecutedAt: number;
  time: number;
  delta: number;
}

export const createBlockState = (obj?: Partial<BlockState>): BlockState => ({
  active: true,
  executionCount: 0,
  commandExecutionCounts: [],
  executedBy: "",
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
