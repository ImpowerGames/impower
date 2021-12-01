import { ConfigParameters } from "../types/interfaces/configParameters";

type Unsubscribe = () => void;

class ConfigCache {
  private static _instance: ConfigCache;

  public static get instance(): ConfigCache {
    if (!this._instance) {
      this._instance = new ConfigCache();
    }
    return this._instance;
  }

  private _params: ConfigParameters;

  public icons: { [name: string]: { v: string; d: string } };

  public get params(): ConfigParameters {
    return this._params;
  }

  protected _listeners: Set<{
    callback: (value: ConfigParameters) => void;
    once?: boolean;
  }> = new Set();

  set(params: ConfigParameters): void {
    this._params = { ...(this._params || {}), ...params };
    const listeners = Array.from(this._listeners);
    listeners.forEach((listener) => {
      if (listener) {
        const { callback, once } = listener;
        if (callback) {
          callback(params);
        }
        if (once) {
          this._listeners.delete(listener);
        }
      }
    });
  }

  observe(
    callback: (value: ConfigParameters) => void,
    once?: boolean
  ): Unsubscribe {
    const listener = { callback, once };
    this._listeners.add(listener);
    return (): void => {
      this._listeners.delete(listener);
    };
  }

  fetch(): Promise<ConfigParameters> {
    return new Promise((resolve) => {
      this.observe(resolve, true);
    });
  }
}

export default ConfigCache;
