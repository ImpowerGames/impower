/* eslint-disable @typescript-eslint/ban-types */
import {
  get as _get,
  onValue as _onValue,
  ref as _ref,
} from "firebase/database";
import { DataSnapshot, ListenOptions, Unsubscribe } from "../types/aliases";
import { DataStateReadPath } from "../types/dataStatePath";
import DataState from "./dataState";

class DataStateRead<T extends DataStateReadPath = DataStateReadPath> {
  protected _path: T;

  public get path(): string {
    return this._path.join("/");
  }

  public get key(): string {
    return this._path.join("%");
  }

  constructor(...pathSegments: T) {
    this._path = pathSegments;
  }

  /**
   * Gets the result for this query.
   *
   * @param checkCacheFirst Fetch the value from the session cache if it exists, otherwise, fetch it from the server.
   *
   * @returns A promise which resolves to the resulting DataSnapshot if a value is
   * available, or rejects if the client is unable to return a value (e.g., if the
   * server is unreachable and there is nothing cached).
   */
  async get(checkCacheFirst = false): Promise<DataSnapshot> {
    const internal = await DataState.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    if (checkCacheFirst) {
      logInfo("DataState", `GET (cached) ${this.path}`);
      const result = new Promise(
        (resolve: (snapshot: DataSnapshot) => unknown) => {
          _onValue(_ref(internal, this.path), resolve, { onlyOnce: true });
        }
      );
      logInfoEnd("DataState", `GET (cached) ${this.path}`);
      return result;
    }
    logInfo("DataState", `GET ${this.path}`);
    const result = _get(_ref(internal, this.path));
    logInfoEnd("DataState", `GET ${this.path}`);
    return result;
  }

  /**
   * Listens for data changes at a particular location.
   *
   * This is the primary way to read data from a Database. Your callback
   * will be triggered for the initial data and again whenever the data changes.
   * Invoke the returned unsubscribe callback to stop receiving updates. See
   * {@link https://firebase.google.com/docs/database/web/retrieve-data | Retrieve Data on the Web}
   * for more details.
   *
   * An `onValue` event will trigger once with the initial data stored at this
   * location, and then trigger again each time the data changes. The
   * `DataSnapshot` passed to the callback will be for the location at which
   * `on()` was called. It won't trigger until the entire contents has been
   * synchronized. If the location has no data, it will be triggered with an empty
   * `DataSnapshot` (`val()` will return `null`).
   *
   * @param callback - A callback that fires when the specified event occurs. The
   * callback will be passed a DataSnapshot.
   * @param options - An object that can be used to configure `onlyOnce`, which
   * then removes the listener after its first invocation.
   *
   * @returns A function that can be invoked to remove the listener.
   */
  async observe(
    callback: (snapshot: DataSnapshot) => unknown,
    options: ListenOptions = { onlyOnce: false }
  ): Promise<Unsubscribe> {
    const internal = await DataState.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    logInfo("DataState", `OBSERVE (${this.path})`);
    return _onValue(_ref(internal, this.path), callback, options);
  }
}

export default DataStateRead;
