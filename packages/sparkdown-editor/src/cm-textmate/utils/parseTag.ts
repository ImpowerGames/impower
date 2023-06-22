import { Tag, tags } from "@lezer/highlight";

/**
 * 1. Tag modifier text
 * 2. Tag function name
 * 3. Tag function argument
 * 4. Tag name, no function
 */
const PARSE_TAG_REGEX =
  /^(?:\((\S*?)\))?(?:\s+|^)(?:(?:(\S+?)\((\S+)\))|(\S+))$/;

/**
 * Parses a tag string, and converts it into an object that can be fed into
 * CodeMirror's `styleTags` function.
 *
 * Examples:
 *
 * ```text
 * tag
 * func(tag)
 * (!) tag
 * (!) func(tag)
 * (...) tag
 * (...) func(tag)
 * (parent/) tag
 * (parent/) func(tag)
 * (grandparent/parent) tag
 * (grandparent/parent) func(tag)
 * ```
 */
const parseTag = (node: string, str: string) => {
  const [, modifier, func, arg, last] = PARSE_TAG_REGEX.exec(str)!;

  if (last && !(last in tags)) {
    throw new Error(`Unknown tag: ${last}`);
  }
  if (func && !(func in tags)) {
    throw new Error(`Unknown tag function: ${func}`);
  }
  if (arg && !(arg in tags)) {
    throw new Error(`Unknown tag argument: ${arg}`);
  }

  let name = arg ? arg : last;
  let prefix = "";
  let suffix = "";

  // @ts-ignore TS doesn't realize I've checked for this
  let tag: Tag = tags[name];

  if (func) {
    // @ts-ignore ditto
    tag = tags[func](tag);
  }

  if (modifier) {
    if (modifier.endsWith("...")) {
      suffix = "/...";
    }
    if (modifier.endsWith("!")) {
      suffix = "!";
    }
    if (modifier.endsWith("/")) {
      prefix = modifier;
    }
    // check for parents
    else {
      const split = modifier.split("/");
      const last = split[split.length - 1];
      if (last === "..." || last === "!") {
        split.pop();
      }
      if (split.length) {
        prefix = `${split.join("/")}/`;
      }
    }
  }

  // e.g. foo/... or foo/bar/... etc.
  const style = `${prefix}${node}${suffix}`;

  return { [style]: tag };
};

export default parseTag;
