export class JsonReader {
  constructor(text: string) {
    this._rootObject = JSON.parse(text);
  }

  public ToDictionary(): Record<string, unknown> {
    return this._rootObject as Record<string, unknown>;
  }

  public ToArray(): unknown[] {
    return this._rootObject as unknown[];
  }

  private _rootObject: unknown[] | Record<string, unknown>;
}
