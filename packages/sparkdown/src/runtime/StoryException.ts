export class StoryException extends Error {
  public useEndLineNumber: boolean;
  public raisedPath: string | null = null;
  public raisedAddress: number | null = null;
  public errorValue: unknown = undefined;
  public positionPending = false;
  public override message: string;
  public override name: string;

  constructor(message: string) {
    super(message);
    this.useEndLineNumber = false;
    this.message = message;
    this.name = "StoryException";
  }
}

export function luauRuntimeError(message: string): StoryException {
  const e = new StoryException(message);
  e.positionPending = true;
  return e;
}

export class StepLimitExceeded extends Error {
  constructor() {
    super("Step limit exceeded");
    this.name = "StepLimitExceeded";
  }
}
