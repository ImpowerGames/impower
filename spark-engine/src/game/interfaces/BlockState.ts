export interface BlockState {
  loaded: boolean;
  executionCount: number;
  commandExecutionCounts: Record<string, number>;
  choiceChosenCounts: Record<string, number>;
  executedBy: string | null;
  returnWhenFinished: boolean;
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
