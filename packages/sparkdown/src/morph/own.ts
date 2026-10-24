/**
 * A record's own entry. Morph tables are keyed by names from art and scripts
 * (an image called `toString`, a state called `constructor`), and plain
 * objects that crossed a JSON boundary inherit those names from
 * `Object.prototype`.
 */
export const own = <T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** An empty table with no inherited names, for building records keyed by such names. */
export const table = <T>(): Record<string, T> => Object.create(null);
