/* eslint-disable no-cond-assign */
import { NodeProp, NodeSet, NodeType } from "@lezer/common";
import { MarkdownParser } from "../classes/MarkdownParser";
import { DefaultBlockParsers } from "../constants/DefaultBlockParsers";
import { DefaultEndLeaf } from "../constants/DefaultEndLeaf";
import { DefaultInline } from "../constants/DefaultInline";
import { DefaultLeafBlocks } from "../constants/DefaultLeafBlocks";
import { DefaultSkipMarkup } from "../constants/DefaultSkipMarkup";
import { Type } from "./type";

const nodeTypes = [NodeType.none];
for (let i = 1, name; (name = Type[i]); i += 1) {
  nodeTypes[i] = NodeType.define({
    id: i,
    name,
    props:
      i >= Type.Escape
        ? []
        : [
            [
              NodeProp.group,
              i in DefaultSkipMarkup
                ? ["Block", "BlockContext"]
                : ["Block", "LeafBlock"],
            ],
          ],
  });
}

/// The default CommonMark parser.
export const parser = new MarkdownParser(
  new NodeSet(nodeTypes),
  Object.keys(DefaultBlockParsers).map((n) => DefaultBlockParsers[n]),
  Object.keys(DefaultBlockParsers).map((n) => DefaultLeafBlocks[n]),
  Object.keys(DefaultBlockParsers),
  DefaultEndLeaf,
  DefaultSkipMarkup,
  Object.keys(DefaultInline).map((n) => DefaultInline[n]),
  Object.keys(DefaultInline),
  []
);
