const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const IDENTITY_KEYS = new Set(["$type", "$name"]);

export const inheritDefaults = <T>(value: T, defaults: unknown): T => {
  if (!isPlainObject(defaults)) {
    return value;
  }
  if (!isPlainObject(value)) {
    return (value === undefined ? structuredClone(defaults) : value) as T;
  }
  const result: Record<string, any> = { ...value };
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (IDENTITY_KEYS.has(key)) {
      continue;
    }
    const authored = result[key];
    if (authored === undefined) {
      result[key] =
        typeof defaultValue === "object" && defaultValue !== null
          ? structuredClone(defaultValue)
          : defaultValue;
    } else if (isPlainObject(authored) && isPlainObject(defaultValue)) {
      result[key] = inheritDefaults(authored, defaultValue);
    }
  }
  return result as T;
};

export const applyBuiltinDefaults = (context: Record<string, any>): void => {
  for (const [, structs] of Object.entries(context)) {
    if (!isPlainObject(structs)) {
      continue;
    }
    const defaults = structs["$default"];
    if (!isPlainObject(defaults)) {
      continue;
    }
    for (const [name, struct] of Object.entries(structs)) {
      if (name === "$default" || !isPlainObject(struct)) {
        continue;
      }
      structs[name] = inheritDefaults(struct, defaults);
    }
  }
};
