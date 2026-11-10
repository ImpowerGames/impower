export type RollDebugTarget = "beat" | "choice";

export interface RollDebugArguments {
  to: RollDebugTarget;
}

export interface RollDebugResult {
  moved: boolean;
}

export class RollBackDebugRequest {
  static readonly command = "sparkdown/rollBack";
}

export class RollForwardDebugRequest {
  static readonly command = "sparkdown/rollForward";
}
