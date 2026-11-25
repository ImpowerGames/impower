import { own } from "@impower/sparkdown/src/morph/own";
import { MarkupKind, type MarkupContent } from "vscode-languageserver";

const LAYOUT_TRANSITION =
  "`layout` animates any change in the element's place or size, whatever caused it: its content changed, a sibling was added, removed or moved, or a style changed its size. It takes the duration, easing and delay given to it in the transition list. The element's real size changes, so text, borders and corners keep their shape.\n\nA preview, a step back, a loaded save, skipping and the reader's reduced-motion setting show the new place and size at once.";

const TRANSITION_VALUES: Record<string, string> = {
  layout: LAYOUT_TRANSITION,
};

const STYLE_VALUE_DESCRIPTIONS: Record<string, Record<string, string>> = {
  transition: TRANSITION_VALUES,
  transition_property: TRANSITION_VALUES,
};

export const getStyleValueDescription = (
  property: string,
  value: string,
): MarkupContent | undefined => {
  const description = own(
    own(STYLE_VALUE_DESCRIPTIONS, property.replaceAll("-", "_")),
    value,
  );
  return description ? { kind: MarkupKind.Markdown, value: description } : undefined;
};
