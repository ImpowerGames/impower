export interface BlockState {
  active: boolean;
  executionCount: number;
  commandExecutionCounts: number[];
  executedByBlockId: string;
  returnedFromBlockId: string;
  isExecuting: boolean;
  hasFinished: boolean;
  hasReturned: boolean;
  satisfiedTriggers: string[];
  unsatisfiedTriggers: string[];
  executingCommandIndex: number;
  previousCommandIndex: number;
  commandJumpStack: number[];
  timeOfLastCommandExecution: number;
  time: number;
  delta: number;
}

export const createBlockState = (): BlockState => ({
  active: true,
  executionCount: 0,
  commandExecutionCounts: [],
  executedByBlockId: "",
  returnedFromBlockId: "",
  isExecuting: false,
  hasFinished: false,
  hasReturned: false,
  satisfiedTriggers: [],
  unsatisfiedTriggers: [],
  executingCommandIndex: 0,
  previousCommandIndex: 0,
  commandJumpStack: [],
  timeOfLastCommandExecution: -1,
  time: -1,
  delta: -1,
});
