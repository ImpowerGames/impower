import { type Tag, tags } from "@lezer/highlight";

const PARSE_TAG_REGEX = /^(?:\((\S*?)\))?(?:\s+|^)(\S+)$/;

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

  const parts = tagExpression?.split("(") || [];

  const baseName = parts.pop()!.replace(/\)+$/, "");

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

  const style = `${prefix}${node}${suffix}`;

  if (!tag.set) {
    throw new Error(`Invalid tag: ${str}`);
  }

  return { [style]: tag };
};
