import { LoggingLevel } from "../enums/loggingLevel";

export class Logger {
  private static _instance: Logger;

  public static get instance(): Logger {
    if (!this._instance) {
      this._instance = new Logger();
      this._instance._level = Number(process.env.NEXT_PUBLIC_LOGGING_LEVEL);
    }
    return this._instance;
  }

  private _level: LoggingLevel;

  public get level(): LoggingLevel {
    return this._level;
  }

  private _currentGroups: string[] = [];

  public get currentGroups(): string[] {
    return this._currentGroups;
  }
}
