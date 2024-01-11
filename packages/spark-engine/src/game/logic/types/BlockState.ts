export interface BlockState {
  loaded?: boolean;
  isExecuting?: boolean;
  isExecutingCommand?: boolean;
  hasFinished?: boolean;
  returnWhenFinished?: boolean;
  executedBy: string | null;

  executingIndex: number;
  previousIndex: number;
  commandJumpStack: number[];
}
