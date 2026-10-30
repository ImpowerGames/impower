import { isDeepStrictEqual } from "node:util";

const label = (message: unknown): string => {
  const method = (message as { method?: unknown } | null)?.method;
  return typeof method === "string" ? `\`${method}\`` : "a message";
};

const firstDifference = (
  original: unknown,
  copy: unknown,
  path = "",
): string | null => {
  if (isDeepStrictEqual(original, copy)) {
    return null;
  }
  if (
    typeof original !== "object" ||
    original === null ||
    typeof copy !== "object" ||
    copy === null
  ) {
    return `${path || "(root)"}: sent ${String(original)}, received ${String(copy)}`;
  }
  const sentProto = Object.getPrototypeOf(original);
  if (sentProto !== Object.getPrototypeOf(copy)) {
    const name = sentProto?.constructor?.name ?? "null-prototype object";
    return `${path || "(root)"}: sent a ${name}, received a plain copy`;
  }
  const keys = new Set([
    ...Reflect.ownKeys(original),
    ...Reflect.ownKeys(copy),
  ]);
  for (const key of keys) {
    const at = `${path}${path ? "." : ""}${String(key)}`;
    if (typeof key === "symbol") {
      return `${at}: a symbol key does not survive`;
    }
    const inner = firstDifference(
      (original as Record<string, unknown>)[key],
      (copy as Record<string, unknown>)[key],
      at,
    );
    if (inner) {
      return inner;
    }
  }
  return `${path || "(root)"}: differs`;
};

export function cloneMessage<T>(message: T): T {
  let copy: T;
  try {
    copy = structuredClone(message);
  } catch (e) {
    throw new Error(
      `${label(message)} cannot cross a thread: ${(e as Error)?.message ?? e}`,
    );
  }
  const difference = firstDifference(message, copy);
  if (difference) {
    throw new Error(
      `${label(message)} changes when it crosses a thread: ${difference}`,
    );
  }
  return copy;
}
