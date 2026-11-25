import type { SyntaxNode } from "@lezer/common";
import {
  type ShowingRefusal,
  writeSparkleSelectorChecked,
} from "../../../../sparkle-style-transformer/src/utils/sparkleSelector";

export const showingRefusalAt = (
  stateName: SyntaxNode,
  read: (from: number, to: number) => string,
): ShowingRefusal | undefined => {
  let key: SyntaxNode | null = stateName.parent;
  while (key && key.name !== "LuauStructBlockKey") {
    key = key.parent;
  }
  if (!key) {
    return undefined;
  }
  const { refusals } = writeSparkleSelectorChecked(read(key.from, key.to), {
    breakpoints: {},
    colorScheme: "attribute",
  });
  const from = stateName.from - 1 - key.from;
  const refusal = refusals.find((r) => r.from === from);
  return refusal && { ...refusal, from: key.from + refusal.from, to: key.from + refusal.to };
};
