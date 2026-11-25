import type { SyntaxNode } from "@lezer/common";
import {
  type ShowingRefusal,
  writeSparkleSelectorChecked,
} from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";
import { structBlockKeyNode } from "./braceBlocks";

const KEY = "LuauStructBlockKey";

export const showingRefusalAt = (
  stateName: SyntaxNode,
  read: (from: number, to: number) => string,
): ShowingRefusal | undefined => {
  let key: SyntaxNode | null = stateName.parent;
  while (key && key.name !== KEY) {
    key = key.parent;
  }
  if (!key) {
    return undefined;
  }
  const ancestors: SyntaxNode[] = [];
  for (let node = key.parent; node; node = node.parent) {
    const owner = node.name === "LuauStructBlock" ? structBlockKeyNode(node) : null;
    if (owner && owner.from < key.from) {
      ancestors.push(owner);
    }
  }
  let afterCombinator = false;
  for (const ancestor of ancestors.reverse()) {
    afterCombinator = writeSparkleSelectorChecked(read(ancestor.from, ancestor.to), {
      breakpoints: {},
      colorScheme: "attribute",
      afterCombinator,
    }).afterCombinator;
  }
  const { refusals } = writeSparkleSelectorChecked(read(key.from, key.to), {
    breakpoints: {},
    colorScheme: "attribute",
    afterCombinator,
  });
  const from = stateName.from - 1 - key.from;
  const refusal = refusals.find((r) => r.from === from);
  return refusal && { ...refusal, from: key.from + refusal.from, to: key.from + refusal.to };
};
