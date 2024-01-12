export interface BlockState {
  loaded?: boolean;
  isExecuting?: boolean;
  isExecutingCommand?: boolean;
  hasFinished?: boolean;
  willReturn?: boolean;
  executedBy: string | null;

  executingIndex: number;
  previousIndex: number;
  commandJumpStack: number[];
}
