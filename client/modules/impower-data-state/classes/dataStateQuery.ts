import {
  endAt as _endAt,
  endBefore as _endBefore,
  get as _get,
  limitToFirst as _limitToFirst,
  limitToLast as _limitToLast,
  onValue as _onValue,
  orderByChild as _orderByChild,
  query as _query,
  ref as _ref,
  startAfter as _startAfter,
  startAt as _startAt,
} from "firebase/database";
import {
  DataSnapshot,
  ListenOptions,
  QueryConstraint,
  QueryConstraintType,
  Unsubscribe,
} from "../types/aliases";
import { DataStateQueryPath } from "../types/dataStatePath";
import DataState from "./dataState";

interface ConstraintInfo {
  type: QueryConstraintType;
  params: (string | number | boolean)[];
}

class DataStateQuery<T extends DataStateQueryPath = DataStateQueryPath> {
  protected _path: T;

  public get path(): string {
    return this._path.join("/");
  }

  public get key(): string {
    return this._path.join("%");
  }

  protected _constraints: QueryConstraint[] = [];

  protected _constraintSummaries: ConstraintInfo[] = [];

  public get constraintSummaries(): ConstraintInfo[] {
    return this._constraintSummaries;
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
    const contraintsSummary = this.constraintSummaries.map(
      (c) => `${c.type}(${c.params.join(",")})`
    );
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    if (this._constraints.length > 0) {
      if (checkCacheFirst) {
        logInfo("DataState", `GET CACHED (${this.path})`, contraintsSummary);
        const result = new Promise(
          (resolve: (snapshot: DataSnapshot) => unknown) =>
            _onValue(
              _query(_ref(internal, this.path), ...this._constraints),
              resolve,
              { onlyOnce: true }
            )
        );
        logInfoEnd("DataState", `GET CACHED (${this.path})`, contraintsSummary);
        return result;
      }
      logInfo("DataState", `GET (${this.path})`, contraintsSummary);
      const result = _get(
        _query(_ref(internal, this.path), ...this._constraints)
      );
      logInfoEnd("DataState", `GET (${this.path})`, contraintsSummary);
      return result;
    }
    if (checkCacheFirst) {
      logInfo("DataState", `GET CACHED (${this.path})`, contraintsSummary);
      const result = new Promise(
        (resolve: (snapshot: DataSnapshot) => unknown) =>
          _onValue(_ref(internal, this.path), resolve, {
            onlyOnce: true,
          })
      );
      logInfoEnd("DataState", `GET CACHED (${this.path})`, contraintsSummary);
      return result;
    }
    logInfo("DataState", `GET (${this.path})`, contraintsSummary);
    const result = _get(_ref(internal, this.path));
    logInfoEnd("DataState", `GET (${this.path})`, contraintsSummary);
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
    const contraintsSummary = this.constraintSummaries.map(
      (c) => `${c.type}(${c.params.join(",")})`
    );
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    logInfo("DataState", `OBSERVE (${this.path})`, contraintsSummary);
    if (this._constraints.length > 0) {
      return _onValue(
        _query(_ref(internal, this.path), ...this._constraints),
        callback,
        options
      );
    }
    return _onValue(_ref(internal, this.path), callback, options);
  }

  /**
   * Creates a new `DataStateQuery` that orders by the specified child key.
   *
   * Queries can only order by one key at a time. Calling `orderByChild()`
   * multiple times on the same query is an error.
   *
   * Firebase queries allow you to order your data by any child key on the fly.
   * However, if you know in advance what your indexes will be, you can define
   * them via the .indexOn rule in your Security Rules for better performance. See
   * the{@link https://firebase.google.com/docs/database/security/indexing-data}
   * rule for more information.
   *
   * You can read more about `orderByChild()` in
   * {@link https://firebase.google.com/docs/database/web/lists-of-data#sort_data | Sort data}.
   *
   * @param path - The path to order by.
   */
  orderByChild(path: string): DataStateQuery<T> {
    const constraint = _orderByChild(path);
    this._constraints = [...this._constraints, constraint];
    this._constraintSummaries = [
      ...this._constraintSummaries,
      { type: "orderByChild", params: [path] },
    ];
    return this;
  }

  /**
   * Creates a new `DataStateQuery` that if limited to the first specific number
   * of children.
   *
   * The `limitToFirst()` method is used to set a maximum number of children to be
   * synced for a given callback. If we set a limit of 100, we will initially only
   * receive up to 100 `child_added` events. If we have fewer than 100 messages
   * stored in our Database, a `child_added` event will fire for each message.
   * However, if we have over 100 messages, we will only receive a `child_added`
   * event for the first 100 ordered messages. As items change, we will receive
   * `child_removed` events for each item that drops out of the active list so
   * that the total number stays at 100.
   *
   * You can read more about `limitToFirst()` in
   * {@link https://firebase.google.com/docs/database/web/lists-of-data#filtering_data | Filtering data}.
   *
   * @param limit - The maximum number of nodes to include in this query.
   */
  limitToFirst(limit: number): DataStateQuery<T> {
    const constraint = _limitToFirst(limit);
    this._constraints = [...this._constraints, constraint];
    this._constraintSummaries = [
      ...this._constraintSummaries,
      { type: "limitToFirst", params: [limit] },
    ];
    return this;
  }

  /**
   * Creates a new `DataStateQuery` that is limited to return only the last
   * specified number of children.
   *
   * The `limitToLast()` method is used to set a maximum number of children to be
   * synced for a given callback. If we set a limit of 100, we will initially only
   * receive up to 100 `child_added` events. If we have fewer than 100 messages
   * stored in our Database, a `child_added` event will fire for each message.
   * However, if we have over 100 messages, we will only receive a `child_added`
   * event for the last 100 ordered messages. As items change, we will receive
   * `child_removed` events for each item that drops out of the active list so
   * that the total number stays at 100.
   *
   * You can read more about `limitToLast()` in
   * {@link https://firebase.google.com/docs/database/web/lists-of-data#filtering_data | Filtering data}.
   *
   * @param limit - The maximum number of nodes to include in this query.
   */
  limitToLast(limit: number): DataStateQuery<T> {
    const constraint = _limitToLast(limit);
    this._constraints = [...this._constraints, constraint];
    this._constraintSummaries = [
      ...this._constraintSummaries,
      { type: "limitToLast", params: [limit] },
    ];
    return this;
  }

  /**
   * Creates a `DataStateQuery` with the specified starting point.
   *
   * Using `startAt()`, `startAfter()`, `endBefore()`, `endAt()` and `equalTo()`
   * allows you to choose arbitrary starting and ending points for your queries.
   *
   * The starting point is inclusive, so children with exactly the specified value
   * will be included in the query. The optional key argument can be used to
   * further limit the range of the query. If it is specified, then children that
   * have exactly the specified value must also have a key name greater than or
   * equal to the specified key.
   *
   * You can read more about `startAt()` in
   * {@link https://firebase.google.com/docs/database/web/lists-of-data#filtering_data | Filtering data}.
   *
   * @param value - The value to start at. The argument type depends on which
   * `orderBy*()` function was used in this query. Specify a value that matches
   * the `orderBy*()` type. When used in combination with `orderByKey()`, the
   * value must be a string.
   * @param key - The child key to start at. This argument is only allowed if
   * ordering by child, value, or priority.
   */
  startAt(value?: string | number | boolean, key?: string): DataStateQuery<T> {
    const constraint = _startAt(value, key);
    this._constraints = [...this._constraints, constraint];
    this._constraintSummaries = [
      ...this._constraintSummaries,
      { type: "startAt", params: [value, key] },
    ];
    return this;
  }

  /**
   * Creates a `DataStateQuery` with the specified starting point (exclusive).
   *
   * Using `startAt()`, `startAfter()`, `endBefore()`, `endAt()` and `equalTo()`
   * allows you to choose arbitrary starting and ending points for your queries.
   *
   * The starting point is exclusive. If only a value is provided, children
   * with a value greater than the specified value will be included in the query.
   * If a key is specified, then children must have a value greater than or equal
   * to the specified value and a a key name greater than the specified key.
   *
   * @param value - The value to start after. The argument type depends on which
   * `orderBy*()` function was used in this query. Specify a value that matches
   * the `orderBy*()` type. When used in combination with `orderByKey()`, the
   * value must be a string.
   * @param key - The child key to start after. This argument is only allowed if
   * ordering by child, value, or priority.
   */
  startAfter(
    value?: string | number | boolean,
    key?: string
  ): DataStateQuery<T> {
    const constraint = _startAfter(value, key);
    this._constraints = [...this._constraints, constraint];
    this._constraintSummaries = [
      ...this._constraintSummaries,
      { type: "startAfter", params: [value, key] },
    ];
    return this;
  }

  /**
   * Creates a `DataStateQuery` with the specified ending point.
   *
   * Using `startAt()`, `startAfter()`, `endBefore()`, `endAt()` and `equalTo()`
   * allows you to choose arbitrary starting and ending points for your queries.
   *
   * The ending point is inclusive, so children with exactly the specified value
   * will be included in the query. The optional key argument can be used to
   * further limit the range of the query. If it is specified, then children that
   * have exactly the specified value must also have a key name less than or equal
   * to the specified key.
   *
   * You can read more about `endAt()` in
   * {@link https://firebase.google.com/docs/database/web/lists-of-data#filtering_data | Filtering data}.
   *
   * @param value - The value to end at. The argument type depends on which
   * `orderBy*()` function was used in this query. Specify a value that matches
   * the `orderBy*()` type. When used in combination with `orderByKey()`, the
   * value must be a string.
   * @param key - The child key to end at, among the children with the previously
   * specified priority. This argument is only allowed if ordering by child,
   * value, or priority.
   */
  endAt(value?: string | number | boolean, key?: string): DataStateQuery<T> {
    const constraint = _endAt(value, key);
    this._constraints = [...this._constraints, constraint];
    this._constraintSummaries = [
      ...this._constraintSummaries,
      { type: "endAt", params: [value, key] },
    ];
    return this;
  }

  /**
   * Creates a `DataStateQuery` with the specified ending point (exclusive).
   *
   * Using `startAt()`, `startAfter()`, `endBefore()`, `endAt()` and `equalTo()`
   * allows you to choose arbitrary starting and ending points for your queries.
   *
   * The ending point is exclusive. If only a value is provided, children
   * with a value less than the specified value will be included in the query.
   * If a key is specified, then children must have a value lesss than or equal
   * to the specified value and a a key name less than the specified key.
   *
   * @param value - The value to end before. The argument type depends on which
   * `orderBy*()` function was used in this query. Specify a value that matches
   * the `orderBy*()` type. When used in combination with `orderByKey()`, the
   * value must be a string.
   * @param key - The child key to end before, among the children with the
   * previously specified priority. This argument is only allowed if ordering by
   * child, value, or priority.
   */
  endBefore(
    value?: string | number | boolean,
    key?: string
  ): DataStateQuery<T> {
    const constraint = _endBefore(value, key);
    this._constraints = [...this._constraints, constraint];
    this._constraintSummaries = [
      ...this._constraintSummaries,
      { type: "endBefore", params: [value, key] },
    ];
    return this;
  }
}

export default DataStateQuery;
