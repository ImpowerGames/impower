export const readTagExpression = <T>(expression: string, tags: object, tag: string): T => {
  const table = tags as Record<string, unknown>;
  const read = (name: string) =>
    Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined;
  const parts = expression.split("(");
  const baseName = parts.pop()!.replace(/\)+$/, "");
  const base = read(baseName);
  if (base === undefined) {
    throw new Error(`Unknown tag: ${baseName}`);
  }
  if (typeof base === "function") {
    throw new Error(`Invalid tag ${JSON.stringify(tag)}: ${baseName} is a tag function, not a tag`);
  }
  let value: unknown = base;
  for (let i = parts.length - 1; i >= 0; i--) {
    const name = parts[i]!;
    const func = read(name);
    if (func === undefined) {
      throw new Error(`Unknown tag function: ${name}`);
    }
    if (typeof func !== "function") {
      throw new Error(`Invalid tag ${JSON.stringify(tag)}: ${name} is a tag, not a tag function`);
    }
    value = func(value);
  }
  if (typeof value !== "object" || value === null || !("set" in value)) {
    throw new Error(`Invalid tag: ${tag}`);
  }
  return value as T;
};
