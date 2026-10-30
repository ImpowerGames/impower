export interface TryGetResult<T> {
  result: T;
  exists: boolean;
}

export function tryGetValueFromMap<K, V>(
  map: Map<K, V> | null,
  key: K,
  value: V,
): TryGetResult<V> {
  if (map === null) {
    return { result: value, exists: false };
  }

  let val = map.get(key);

  if (typeof val === "undefined") {
    return { result: value, exists: false };
  } else {
    return { result: val, exists: true };
  }
}

export function tryParseInt(
  value: any,
  defaultValue: number = 0,
): TryGetResult<number> {
  let val = parseInt(value);

  if (!Number.isNaN(val)) {
    return { result: val, exists: true };
  } else {
    return { result: defaultValue, exists: false };
  }
}

export function tryParseFloat(
  value: any,
  defaultValue: number = 0,
): TryGetResult<number> {
  let val = parseFloat(value);

  if (!Number.isNaN(val)) {
    return { result: val, exists: true };
  } else {
    return { result: defaultValue, exists: false };
  }
}
