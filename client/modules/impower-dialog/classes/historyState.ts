class HistoryState {
  private static _instance: HistoryState;

  public static get instance(): HistoryState {
    if (!this._instance) {
      this._instance = new HistoryState();
    }
    return this._instance;
  }

  prev: string;

  opening: boolean;

  closing: boolean;

  query: Record<string, unknown>;

  queryListeners: ((
    curr: Record<string, unknown>,
    prev?: Record<string, unknown>
  ) => void)[] = [];

  browserListeners: ((
    curr: Record<string, unknown>,
    prev?: Record<string, unknown>
  ) => void)[] = [];
}

export default HistoryState;
