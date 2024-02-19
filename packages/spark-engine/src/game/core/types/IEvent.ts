export interface IEvent<T extends string> {
  readonly type: T;
  /**
   * Returns the event's timestamp as the number of milliseconds measured relative to the time origin.
   *
   * [MDN Reference](https://developer.mozilla.org/docs/Web/API/Event/timeStamp)
   */
  readonly timeStamp: number;
}
