export class StoryException extends Error {
  public useEndLineNumber: boolean;
  /** The path of the content that raised the error, when the story's pointer
   *  no longer names it by the time the error is recorded: a callback run from
   *  host code (`Story.CallLuauFunction`) restores its caller's pointer as the
   *  error unwinds through it. Null while the pointer still names that
   *  content. */
  public raisedPath: string | null = null;
  /** On the program engine, the address of the instruction that raised the
   *  error, kept for the same reason: a callback run from host code
   *  (`ProgramStory.CallLuauFunction`) restores its caller's running
   *  instruction as the error unwinds through it. Null while the running
   *  instruction is still the one that raised it. */
  public raisedAddress: number | null = null;
  /** The value `error(v)` raised when it is no string or number message
   *  (a table, nil, a boolean, a function), which `pcall` and `xpcall`
   *  return unchanged in place of `message`. Undefined for a message. */
  public errorValue: unknown = undefined;
  /** True for an error the Luau VM raises for an operation
   *  (`luaG_runerror`: a call, an index, arithmetic, a comparison), which
   *  takes the position of the instruction raising it from the story's
   *  `errorMessageFormatter`, as `error` does. The step running that
   *  instruction adds it and clears this; an error a builtin raises for its
   *  arguments (`luaL_error`) never sets it. */
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

/** An error the Luau VM raises for an operation, in Luau's wording, which
 *  the step running the operation positions (`positionPending`). */
export function luauRuntimeError(message: string): StoryException {
  const e = new StoryException(message);
  e.positionPending = true;
  return e;
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
