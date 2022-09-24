/*!
 * get-value <https://github.com/jonschlinkert/get-value>
 *
 * Copyright (c) 2014-2018, Jon Schlinkert.
 * Released under the MIT License.
 */

interface Options<T = never, V = never> {
  default?: V;
  separator?: string;
  joinChar?: string;
  join?: (arr: string[]) => string;
  split?: (str: string) => string[];
  isValid?: (key: string, target: T) => boolean;
}

const join = <T, V>(
  segs: string[],
  joinChar: string,
  options: Options<T, V>
): string => {
  if (typeof options.join === "function") {
    return options.join(segs);
  }
  return segs[0] + joinChar + segs[1];
};

const split = <T, V>(
  path: string,
  splitChar: string,
  options: Options<T, V>
): string[] => {
  if (typeof options.split === "function") {
    return options.split(path);
  }
  return path.split(splitChar);
};

const isValid = <T, V>(
  key: string,
  target: T,
  options: Options<T, V>
): boolean => {
  if (typeof options.isValid === "function") {
    return options.isValid(key, target);
  }
  return true;
};

const isValidObject = (val: unknown): boolean => {
  return typeof val === "object" || typeof val === "function";
};

export const get = <T, V>(
  target: T,
  path: string,
  options: Options<T, V> = {}
): V | undefined => {
  if (!isValidObject(target)) {
    return typeof options.default !== "undefined" ? options.default : undefined;
  }

  if (typeof path === "number") {
    path = String(path);
  }

  const isArray = Array.isArray(path);
  const isString = typeof path === "string";
  const splitChar = options.separator || ".";
  const joinChar =
    options.joinChar || (typeof splitChar === "string" ? splitChar : ".");

  if (!isString && !isArray) {
    return undefined;
  }

  if (isString && path in target) {
    return isValid(path, target, options)
      ? (target as unknown as Record<string, V | undefined>)[path]
      : options.default;
  }

  const segs = isArray ? path : split(path, splitChar, options);
  const len = segs.length;
  let idx = 0;

  do {
    let prop = segs[idx];
    if (typeof prop === "number") {
      prop = String(prop);
    }

    while (prop && prop.slice(-1) === "\\") {
      idx += 1;
      prop = join([prop.slice(0, -1), segs[idx] || ""], joinChar, options);
    }

    if (prop in target) {
      if (!isValid(prop, target, options)) {
        return options.default;
      }

      target = (target as unknown as Record<string, V | undefined>)[
        prop
      ] as unknown as T;
    } else {
      let hasProp = false;
      let n = idx + 1;

      while (n < len) {
        prop = join([prop, segs[n]], joinChar, options);
        n += 1;
        hasProp = prop in target;
        if (hasProp) {
          if (!isValid(prop, target, options)) {
            return options.default;
          }

          target = (target as unknown as Record<string, V | undefined>)[
            prop
          ] as unknown as T;
          idx = n - 1;
          break;
        }
      }

      if (!hasProp) {
        return options.default;
      }
    }
    idx += 1;
  } while (idx < len && isValidObject(target));

  if (idx === len) {
    return target as unknown as V;
  }

  return options.default;
};
