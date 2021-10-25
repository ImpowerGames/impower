export class Timestamp {
  private date: Date;

  private _server: boolean;

  public get server(): boolean {
    return this._server;
  }

  toDate(): Date {
    return this.date;
  }

  constructor() {
    this.date = new Date();
    this._server = true;
  }
}

export const isTimestamp = (obj: unknown): obj is Timestamp => {
  if (!obj) {
    return false;
  }
  const timestamp = obj as Timestamp;
  return timestamp.toDate !== undefined;
};
