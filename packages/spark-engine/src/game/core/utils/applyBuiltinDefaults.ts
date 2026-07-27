const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Identity fields belong to the instance, never to the type it inherits from.
 * Everything else on `$default` is fair game, including `$link`.
 */
const IDENTITY_KEYS = new Set(["$type", "$name"]);

/**
 * Deep-fills `value` with anything `defaults` has that `value` does not.
 *
 * Authored values always win, and only ever at the leaf: authoring one field
 * of a nested group keeps the rest of that group's defaults rather than
 * replacing the whole group. Arrays are treated as leaves -- an authored list
 * replaces the default list wholesale rather than merging element-wise, since
 * position-merging two lists is never what an author means.
 *
 * Returns a new object; neither input is mutated.
 */
export const inheritDefaults = <T>(value: T, defaults: unknown): T => {
  if (!isPlainObject(defaults)) {
    return value;
  }
  if (!isPlainObject(value)) {
    // No authored struct at all -- the defaults ARE the value.
    return (value === undefined ? structuredClone(defaults) : value) as T;
  }
  const result: Record<string, any> = { ...value };
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (IDENTITY_KEYS.has(key)) {
      continue;
    }
    const authored = result[key];
    if (authored === undefined) {
      // Clone anything with identity. Handing out the builtin's own array or
      // object would alias it across every define that inherits it, so one
      // instance mutating its arpeggio tones would rewrite the type default
      // and every sibling along with it.
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

/**
 * Makes every authored define in a game context inherit its type's defaults.
 *
 * A `define x as synth with ... end` reaches the runtime carrying ONLY the
 * properties the author actually wrote -- nothing upstream merges the type's
 * defaults in. The builtin structs look complete only because they are built
 * by calling their `default_*()` constructor. So a voice authored as just
 * `pitch = { frequency = 340 }` arrives with no shape, no envelope and no
 * volume, and every consumer has to guess (#268).
 *
 * The type's own `$default` struct is already sitting in the context next to
 * the authored ones, so inheritance is resolvable here without knowing
 * anything about particular types. Types whose `$default` carries no real
 * properties -- the structural UI ones like `style`, `screen` and `component`,
 * where being sparse IS the semantics -- come out untouched.
 *
 * Mutates `context` in place, since it is the freshly-built context object.
 */
export const applyBuiltinDefaults = (context: Record<string, any>): void => {
  for (const [type, structs] of Object.entries(context)) {
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
