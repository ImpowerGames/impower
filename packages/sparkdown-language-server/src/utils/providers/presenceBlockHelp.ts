import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import {
  PRESENCE_STATES,
  type Presence,
} from "@impower/sparkdown/src/compiler/constants/selectorStates";
import { type Tree } from "@lezer/common";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";

const STYLING_GUIDE =
  "https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/StyleProps.md#appearing-and-leaving";

const PRESENCE_SUMMARIES: Record<Presence, string> = {
  initial:
    "`@initial` is the look an element has at the instant it appears. From there it moves to its settled look, the style's own properties, by the transitions it has while arriving.",
  show:
    "`@show` applies only while an element is arriving, so an arrival can have its own time and ease. When the arrival ends, the element keeps the style's own properties.",
  hide:
    "`@hide` is the look an element moves to when it leaves. The element stays in place until that motion ends, and is then removed.",
};

const PRESENCE_RULES = [
  "An element appears when it gains its content, when its layout opens with no `with` clause, or when its `if`, `for` or `match` branch is added, and leaves on the reverse. A `with` clause on `open` or `close` takes the place of the blocks for that change.",
  "An `animation` may be set inside the block. The editor preview on a line, a step back and a loaded save show the settled look with no motion.",
];

export const isPresenceBlock = (name: string): name is Presence =>
  (PRESENCE_STATES as readonly string[]).includes(name);

export const presenceBlockDocumentation = (presence: Presence) =>
  [
    PRESENCE_SUMMARIES[presence],
    ...PRESENCE_RULES,
    `[Appearing and leaving](${STYLING_GUIDE})`,
  ].join("\n\n");

export const getPresenceBlockHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  if (!stack.some((node) => node.name === "LuauStyle")) {
    return null;
  }
  const state = stack.find((node) => node.name === "SelectorStateName");
  if (!state) {
    return null;
  }
  const name = document.getText(document.range(state.from, state.to));
  if (
    !isPresenceBlock(name) ||
    document.getText(document.range(state.from - 1, state.from)) !== "@"
  ) {
    return null;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: presenceBlockDocumentation(name),
    },
    range: document.range(state.from - 1, state.to),
  };
};
