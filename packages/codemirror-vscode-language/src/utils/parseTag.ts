import { nodeName } from "@impower/textmate-grammar-tree/src/grammar/utils/nodeName";
import { readTagExpression } from "@impower/textmate-grammar-tree/src/grammar/utils/readTagExpression";
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

  const tag = readTagExpression<Tag>(tagExpression, tags, str);

  const { parents, suffix } = readTagModifier(modifier ?? "", str);
  const path = parents.map((parent) =>
    parent === null ? "*" : selectorName(nodeName(namespace, parent)),
  );
  const style = `${[...path, selectorName(node)].join("/")}${suffix === "!" ? "!" : "/..."}`;

  return { [style]: tag };
};
