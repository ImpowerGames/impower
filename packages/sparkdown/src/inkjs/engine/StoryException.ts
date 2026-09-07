export class StoryException extends Error {
  public useEndLineNumber: boolean;
  public override message: string;
  public override name: string;

  constructor(message: string) {
    super(message);
    this.useEndLineNumber = false;
    this.message = message;
    this.name = "StoryException";
  }
}
