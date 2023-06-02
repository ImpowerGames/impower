import { BlockContext } from "../classes/BlockContext";
import { LeafBlock } from "../classes/LeafBlock";
import { LeafBlockParser } from "../types/leafBlockParser";

export const DefaultLeafBlocks: {
  [name: string]: (cx: BlockContext, leaf: LeafBlock) => LeafBlockParser | null;
} = {};
