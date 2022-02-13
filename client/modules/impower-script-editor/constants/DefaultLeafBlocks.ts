import { BlockContext } from "../classes/BlockContext";
import { DialogueParser } from "../classes/DialogueParser";
import { LeafBlock } from "../classes/LeafBlock";
import { LinkReferenceParser } from "../classes/LinkReferenceParser";
import { SetextHeadingParser } from "../classes/SetextHeadingParser";
import { LeafBlockParser } from "../types/leafBlockParser";

export const DefaultLeafBlocks: {
  [name: string]: (cx: BlockContext, leaf: LeafBlock) => LeafBlockParser | null;
} = {
  LinkReference(_, leaf) {
    return leaf.content.charCodeAt(0) === 91 /* '[' */
      ? new LinkReferenceParser(leaf)
      : null;
  },
  SetextHeading() {
    return new SetextHeadingParser();
  },
  Dialogue() {
    return new DialogueParser();
  },
};
