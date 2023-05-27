/* eslint-disable @typescript-eslint/ban-types */
import {
  ref as _ref,
  remove as _remove,
  set as _set,
  update as _update,
} from "firebase/database";
import { DataStateWritePath } from "../types/dataStatePath";
import DataState from "./dataState";

class DataStateWrite<T extends DataStateWritePath = DataStateWritePath> {
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
   * Writes data to this Database location.
   *
   * This will overwrite any data at this location and all child locations.
   *
   * The effect of the write will be visible immediately, and the corresponding
   * events ("value", "child_added", etc.) will be triggered. Synchronization of
   * the data to the Firebase servers will also be started, and the returned
   * Promise will resolve when complete. If provided, the `onComplete` callback
   * will be called asynchronously after synchronization has finished.
   *
   * Passing `null` for the new value is equivalent to calling `remove()`; namely,
   * all data at this location and all child locations will be deleted.
   *
   * `set()` will remove any priority stored at this location, so if priority is
   * meant to be preserved, you need to use `setWithPriority()` instead.
   *
   * Note that modifying data with `set()` will cancel any pending transactions
   * at that location, so extreme care should be taken if mixing `set()` and
   * `transaction()` to modify the same data.
   *
   * A single `set()` will generate a single "value" event at the location where
   * the `set()` was performed.
   *
   * @param ref - The location to write to.
   * @param value - The value to be written (string, number, boolean, object,
   *   array, or null).
   *
   * @returns Resolves when write to server is complete.
   */
  async set<D>(value: D): Promise<void> {
    const internal = await DataState.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    logInfo("DataState", `SET DATA (${this.path})`, value);
    await _set(_ref(internal, this.path), value);
    logInfoEnd("DataState", `SET DATA (${this.path})`, value);
  }

  /**
   * Writes multiple values to the Database at once.
   *
   * The `values` argument contains multiple property-value pairs that will be
   * written to the Database together. Each child property can either be a simple
   * property (for example, "name") or a relative path (for example,
   * "name/first") from the current location to the data to update.
   *
   * As opposed to the `set()` method, `update()` can be use to selectively update
   * only the referenced properties at the current location (instead of replacing
   * all the child properties at the current location).
   *
   * The effect of the write will be visible immediately, and the corresponding
   * events ('value', 'child_added', etc.) will be triggered. Synchronization of
   * the data to the Firebase servers will also be started, and the returned
   * Promise will resolve when complete. If provided, the `onComplete` callback
   * will be called asynchronously after synchronization has finished.
   *
   * A single `update()` will generate a single "value" event at the location
   * where the `update()` was performed, regardless of how many children were
   * modified.
   *
   * Note that modifying data with `update()` will cancel any pending
   * transactions at that location, so extreme care should be taken if mixing
   * `update()` and `transaction()` to modify the same data.
   *
   * Passing `null` to `update()` will remove the data at this location.
   *
   * See
   * {@link https://firebase.googleblog.com/2015/09/introducing-multi-location-updates-and_86.html | Introducing multi-location updates and more}.
   *
   * @param ref - The location to write to.
   * @param values - Object containing multiple values.
   *
   * @returns Resolves when update on server is complete.
   */
  async update<D extends object>(value: D): Promise<void> {
    const internal = await DataState.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    logInfo("DataState", `UPDATE DATA (${this.path})`, value);
    await _update(_ref(internal, this.path), value);
    logInfoEnd("DataState", `UPDATE DATA (${this.path})`, value);
  }

  /**
   * Removes the data at this Database location.
   *
   * Any data at child locations will also be deleted.
   *
   * The effect of the remove will be visible immediately and the corresponding
   * event 'value' will be triggered. Synchronization of the remove to the
   * Firebase servers will also be started, and the returned Promise will resolve
   * when complete. If provided, the onComplete callback will be called
   * asynchronously after synchronization has finished.
   *
   * @returns Resolves when remove on server is complete.
   */
  async remove(): Promise<void> {
    const internal = await DataState.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    logInfo("DataState", `REMOVE DATA (${this.path})`);
    await _remove(_ref(internal, this.path));
    logInfoEnd("DataState", `REMOVE DATA (${this.path})`);
  }
}

export default DataStateWrite;
