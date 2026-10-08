export class StoryException extends Error {
  public useEndLineNumber: boolean;
  /** The path of the content that raised the error, when the story's pointer
   *  no longer names it by the time the error is recorded: a callback run from
   *  host code (`Story.CallLuauFunction`) restores its caller's pointer as the
   *  error unwinds through it. Null while the pointer still names that
   *  content. */
  public raisedPath: string | null = null;
  public override message: string;
  public override name: string;

  constructor(message: string) {
    super(message);
    this.useEndLineNumber = false;
    this.message = message;
    this.name = "StoryException";
  }
}

/** Thrown by `Story.Step()` when the story passes its `stepLimit`. It is not a
 *  `StoryException`, so `pcall` does not trap it and a continue does not turn
 *  it into a story error; code that catches a callback's errors rethrows it. It
 *  unwinds every callback to the caller that set the limit, which reports its
 *  own budget. */
export class StepLimitExceeded extends Error {
  constructor() {
    super("Step limit exceeded");
    this.name = "StepLimitExceeded";
  }
}
