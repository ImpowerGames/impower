import { AbstractValue, ObjectValue, StringValue } from "./Value";

const STDLIB_MARKERS = new Map<string, ObjectValue>();

export function stdLibMarker(name: string): ObjectValue {
  let marker = STDLIB_MARKERS.get(name);
  if (marker === undefined) {
    marker = new ObjectValue(
      new Map<string, AbstractValue>([["__stdlib_fn", new StringValue(name)]]),
    );
    STDLIB_MARKERS.set(name, marker);
  }
  return marker;
}

export function stdLibMarkerName(v: unknown): string | null {
  if (!(v instanceof ObjectValue) || !(v.value instanceof Map)) return null;
  const tag = v.value.get("__stdlib_fn");
  if (!(tag instanceof StringValue)) return null;
  const name = tag.value ?? "";
  return STDLIB_MARKERS.get(name) === v ? name : null;
}

export function isStdLibMarker(v: unknown): boolean {
  return stdLibMarkerName(v) !== null;
}
