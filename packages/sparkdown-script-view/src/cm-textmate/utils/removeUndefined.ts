/** Removes all properties assigned to `undefined` in an object. */
export function removeUndefined<T extends Record<string, unknown>>(obj: T) {
  // this wacky approach is faster as it avoids an iterator
  const keys = Object.keys(obj) as (keyof T)[];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as keyof T;
    if (obj[key] === undefined) {
      delete obj[key];
    }
  }
  return obj as { [K in keyof T]: Exclude<T[K], undefined> };
}
