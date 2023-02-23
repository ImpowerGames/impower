export interface BlockState {
  name: string;
  loaded: boolean;
  executionCount: number;
  commandExecutionCounts: Record<string, number>;
  choiceChosenCounts: Record<string, number>;
  executedBy: string | null;
  returnWhenFinished: boolean;
  returnedFrom: string;
  isExecuting: boolean;
  isExecutingCommand: boolean;
  hasFinished: boolean;
  hasReturned: boolean;
  satisfiedTriggers: string[];
  unsatisfiedTriggers: string[];
  startIndex: number;
  executingIndex: number;
  previousIndex: number;
  commandJumpStack: number[];
}
