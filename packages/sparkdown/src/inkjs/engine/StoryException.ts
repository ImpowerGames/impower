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
