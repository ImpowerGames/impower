import { nodeName } from "@impower/textmate-grammar-tree/src/grammar/utils/nodeName";
import { readTagModifier } from "@impower/textmate-grammar-tree/src/grammar/utils/readTagModifier";
import { splitTag } from "@impower/textmate-grammar-tree/src/grammar/utils/splitTag";
import { type Tag, tags } from "@lezer/highlight";

const BARE_SELECTOR_NAME = /^[\w$#:+-][\w.$#:+-]*$/;

const selectorName = (name: string) =>
  BARE_SELECTOR_NAME.test(name)
    ? name
    : JSON.stringify(name).replace(
        /\s/g,
        (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
      );

export const parseTag = (
  node: string,
  str: string,
  namespace = "",
): {
  [selector: string]: Tag | readonly Tag[];
} => {
  const split = splitTag(str);

  if (!split) {
    throw new Error(`Invalid tag format: ${str}`);
  }

  const { modifier, expression: tagExpression } = split;

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

  const { parents, suffix } = readTagModifier(modifier ?? "", str);
  const path = parents.map((parent) =>
    parent === null ? "*" : selectorName(nodeName(namespace, parent)),
  );
  const style = `${[...path, selectorName(node)].join("/")}/...${suffix}`;

  if (!tag.set) {
    throw new Error(`Invalid tag: ${str}`);
  }

  return { [style]: tag };
};
