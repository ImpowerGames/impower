import {
  collection as _collection,
  endAt as _endAt,
  endBefore as _endBefore,
  getDocs as _getDocs,
  limit as _limit,
  limitToLast as _limitToLast,
  orderBy as _orderBy,
  query as _query,
  startAfter as _startAfter,
  startAt as _startAt,
  where as _where,
} from "firebase/firestore/lite";
import { CollectionPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";
import {
  DocumentSnapshot,
  QueryConstraint,
  QueryConstraintType,
  QuerySnapshot,
  WhereFilterOp,
} from "../types/aliases";
import DataStore from "./dataStore";
import DataStoreCache from "./dataStoreCache";

interface ConstraintInfo {
  type: QueryConstraintType;
  params: (string | number)[];
}

class DataStoreQuery<T extends CollectionPath = CollectionPath> {
  protected _path: T;

  public get path(): string {
    return this._path.join("/");
  }

  public get key(): string {
    if (this._constraints.length > 0) {
      return this._path.join("%") + JSON.stringify(this._constraintsSummaries);
    }
    return this._path.join("%");
  }

  protected _constraints: QueryConstraint[] = [];

  protected _constraintsSummaries: ConstraintInfo[] = [];

  constructor(...pathSegments: T) {
    this._path = pathSegments;
  }

  /**
   * Executes the query and returns the results as a `QuerySnapshot`.
   *
   * Note: By default, get() attempts to provide up-to-date data when possible
   * by waiting for data from the server, but it will fail
   * if you are offline and the server cannot be reached.
   *
   * @param options An object to configure the get behavior.
   *
   * @return A Promise that will be resolved with the results of the Query.
   */
  async get<D extends DataDocument = DataDocument>(
    checkCacheFirst = true
  ): Promise<QuerySnapshot<D>> {
    const internal = await DataStore.instance.internal();
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    const logInfoEnd = (await import("../../impower-logger/utils/logInfoEnd"))
      .default;
    const contraintsSummary = this._constraintsSummaries.map(
      (c) => `${c.type}(${c.params.join(",")})`
    );
    const cacheKey = this.key;
    if (this._constraints.length > 0) {
      if (checkCacheFirst) {
        const cachedSnap = DataStoreCache.instance.load(cacheKey);
        if (cachedSnap) {
          logInfo("DataStore", `GET CACHED (${this.path})`, contraintsSummary);
          const result = cachedSnap as QuerySnapshot<D>;
          logInfoEnd(
            "DataStore",
            `GET CACHED (${this.path})`,
            contraintsSummary
          );
          return result;
        }
      }
      logInfo("DataStore", `GET (${this.path})`, contraintsSummary);
      const snapshot = await _getDocs(
        _query(_collection(internal, this.path), ...this._constraints)
      );
      DataStoreCache.instance.save(cacheKey, snapshot);
      const result = snapshot as QuerySnapshot<D>;
      logInfoEnd("DataStore", `GET (${this.path})`, contraintsSummary);
      return result;
    }
    if (checkCacheFirst) {
      const cachedSnap = DataStoreCache.instance.load(cacheKey);
      if (cachedSnap) {
        logInfo("DataStore", `GET CACHED (${this.path})`, contraintsSummary);
        const result = cachedSnap as QuerySnapshot<D>;
        logInfoEnd("DataStore", `GET CACHED (${this.path})`, contraintsSummary);
        return result;
      }
    }
    logInfo("DataStore", `GET (${this.path})`, contraintsSummary);
    const ref = _collection(internal, this.path);
    const snapshot = await _getDocs(ref);
    DataStoreCache.instance.save(cacheKey, snapshot);
    const result = snapshot as QuerySnapshot<D>;
    logInfoEnd("DataStore", `GET (${this.path})`, contraintsSummary);
    return result;
  }

  /**
   * Creates and returns a new Query with the additional filter that documents
   * must contain the specified field and the value should satisfy the
   * relation constraint provided.
   *
   * @param fieldPath The path to compare
   * @param opStr The operation string (e.g "<", "<=", "==", ">", ">=").
   * @param value The value for comparison
   *
   * @return The created Query.
   */
  where(
    fieldPath: string,
    opStr: WhereFilterOp,
    value: unknown
  ): DataStoreQuery<T> {
    const constraint = _where(fieldPath, opStr, value);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "where", params: [fieldPath, opStr, JSON.stringify(value)] },
    ];
    return this;
  }

  /**
   * Creates and returns a new Query that's additionally sorted by the
   * specified field, optionally in descending order instead of ascending.
   *
   * @param fieldPath The field to sort by.
   * @param directionStr Optional direction to sort by (`asc` or `desc`). If
   * not specified, order will be ascending.
   *
   * @return The created Query.
   */
  orderBy(fieldPath: string, directionStr?: "asc" | "desc"): DataStoreQuery<T> {
    const constraint = _orderBy(fieldPath, directionStr);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "orderBy", params: [fieldPath, directionStr] },
    ];
    return this;
  }

  /**
   * Creates and returns a new Query that only returns the first matching
   * documents.
   *
   * @param limit The maximum number of items to return.
   *
   * @return The created Query.
   */
  limit(limit: number): DataStoreQuery<T> {
    const constraint = _limit(limit);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "limit", params: [limit] },
    ];
    return this;
  }

  /**
   * Creates and returns a new Query that only returns the last matching
   * documents.
   *
   * You must specify at least one `orderBy` clause for `limitToLast` queries,
   * otherwise an exception will be thrown during execution.
   *
   * @param limit The maximum number of items to return.
   *
   * @return The created Query.
   */
  limitToLast(limit: number): DataStoreQuery<T> {
    const constraint = _limitToLast(limit);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "limitToLast", params: [limit] },
    ];
    return this;
  }

  /**
   * Creates and returns a new Query that starts at the provided document
   * (inclusive). The starting position is relative to the order of the query.
   * The document must contain all of the fields provided in the `orderBy` of
   * this query.
   *
   * @param snapshot The snapshot of the document to start at.
   *
   * @return The created Query.
   */
  startAt<D extends DataDocument>(
    snapshot: DocumentSnapshot<D>
  ): DataStoreQuery<T> {
    const constraint = _startAt(snapshot);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "startAt", params: [snapshot.id] },
    ];
    return this;
  }

  /**
   * Creates and returns a new Query that starts after the provided document
   * (exclusive). The starting position is relative to the order of the query.
   * The document must contain all of the fields provided in the orderBy of
   * this query.
   *
   * @param snapshot The snapshot of the document to start after.
   *
   * @return The created Query.
   */
  startAfter<D extends DataDocument>(
    snapshot: DocumentSnapshot<D>
  ): DataStoreQuery<T> {
    const constraint = _startAfter(snapshot);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "startAfter", params: [snapshot.id] },
    ];
    return this;
  }

  /**
   * Creates and returns a new Query that ends at the provided document
   * (inclusive). The end position is relative to the order of the query. The
   * document must contain all of the fields provided in the orderBy of this
   * query.
   *
   * @param snapshot The snapshot of the document to end at.
   *
   * @return The created Query.
   */
  endAt<D extends DataDocument>(
    snapshot: DocumentSnapshot<D>
  ): DataStoreQuery<T> {
    const constraint = _endAt(snapshot);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "endAt", params: [snapshot.id] },
    ];
    return this;
  }

  /**
   * Creates and returns a new Query that ends before the provided document
   * (exclusive). The end position is relative to the order of the query. The
   * document must contain all of the fields provided in the orderBy of this
   * query.
   *
   * @param snapshot The snapshot of the document to end before.
   *
   * @return The created Query.
   */
  endBefore<D extends DataDocument>(
    snapshot: DocumentSnapshot<D>
  ): DataStoreQuery<T> {
    const constraint = _endBefore(snapshot);
    this._constraints = [...this._constraints, constraint];
    this._constraintsSummaries = [
      ...this._constraintsSummaries,
      { type: "endBefore", params: [snapshot.id] },
    ];
    return this;
  }
}

export default DataStoreQuery;
