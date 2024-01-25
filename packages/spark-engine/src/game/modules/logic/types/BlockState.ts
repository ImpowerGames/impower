export interface BlockState {
  isLoaded?: boolean;
  willReturnToBlockId?: string;
  willReturnToCommandId?: string;

  isExecuting?: boolean;
  isFinished?: boolean;
  commandJumpStack?: string[];
}
