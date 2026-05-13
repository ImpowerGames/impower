import { type Tag, tags } from "@lezer/highlight";

/**
 * 1. Optional Tag modifier text (e.g. `(modifier)`)
 * 2. Tag expression (e.g. `tag`, `func(tag)`, `func1(func2(tag))`)
 */
const PARSE_TAG_REGEX = /^(?:\((\S*?)\))?(?:\s+|^)(\S+)$/;

/**
 * Parses a tag string, and converts it into an object that can be fed into
 * CodeMirror's `styleTags` function. Supports arbitrary function nesting.
 *
 * Examples:
 *
 * ```text
 * tag
 * func(tag)
 * outer(inner(tag))
 * (!) tag
 * (!) func(tag)
 * (...) outer(inner(tag))
 * (parent/) tag
 * (grandparent/parent) func(tag)
 * ```
 */
export const parseTag = (
  node: string,
  str: string,
): {
  [selector: string]: Tag | readonly Tag[];
} => {
  const match = PARSE_TAG_REGEX.exec(str);

  if (!match) {
    throw new Error(`Invalid tag format: ${str}`);
  }

  const [, modifier, tagExpression] = match;

  // Split the tag expression by '(' to extract all functions and the base tag
  // e.g., "standard(function(variableName))" -> parts: ["standard", "function", "variableName))"]
  const parts = tagExpression?.split("(") || [];

  // The last part is the base tag name (strip trailing closing parentheses)
  const baseName = parts.pop()!.replace(/\)+$/, "");

  // The remaining parts are the wrapper functions
  const funcs = parts;

  if (!(baseName in tags)) {
    throw new Error(`Unknown tag: ${baseName}`);
  }

  for (const func of funcs) {
    if (!(func in tags)) {
      throw new Error(`Unknown tag function: ${func}`);
    }
  }

  // @ts-ignore TS doesn't realize I've checked for this
  let tag: Tag = tags[baseName];

  // Apply functions from inside out (right to left)
  for (let i = funcs.length - 1; i >= 0; i--) {
    const funcName = funcs[i];
    // @ts-ignore ditto
    tag = tags[funcName](tag);
  }

  let prefix = "";
  let suffix = "";

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

  if (!tag.set) {
    throw new Error(`Invalid tag: ${str}`);
  }

  return { [style]: tag };
};
