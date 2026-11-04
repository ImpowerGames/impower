import { AbstractValue, ObjectValue, StringValue } from "./Value";

const STDLIB_MARKERS = new Map<string, ObjectValue>();
const STDLIB_MARKER_NAMES = new WeakMap<object, string>();

export function stdLibMarker(name: string): ObjectValue {
  let marker = STDLIB_MARKERS.get(name);
  if (marker === undefined) {
    const map = new Map<string, AbstractValue>([
      ["__stdlib_fn", new StringValue(name)],
    ]);
    marker = new ObjectValue(map);
    STDLIB_MARKERS.set(name, marker);
    STDLIB_MARKER_NAMES.set(map, name);
  }
  return marker;
}

export function stdLibMarkerMapName(map: unknown): string | null {
  if (typeof map !== "object" || map === null) return null;
  return STDLIB_MARKER_NAMES.get(map) ?? null;
}

export function stdLibMarkerName(v: unknown): string | null {
  if (!(v instanceof ObjectValue)) return null;
  return stdLibMarkerMapName(v.value);
}

export function isStdLibMarker(v: unknown): boolean {
  return stdLibMarkerName(v) !== null;
}
