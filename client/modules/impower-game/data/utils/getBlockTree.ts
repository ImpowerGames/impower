import { BlockData } from "../../project/classes/instances/containers/block/blockData";

export const getBlockTree = (
  blocks: Record<string, BlockData>
): {
  [blockId: string]: {
    index: number;
    pos: number;
    line: number;
    type?: "section" | "function" | "method" | "detector";
    parent: string;
    children: string[];
    assets: string[];
  };
} => {
  const blockTree: {
    [blockId: string]: {
      index: number;
      pos: number;
      line: number;
      type?: "section" | "function" | "method" | "detector";
      parent: string;
      children: string[];
      assets: string[];
    };
  } = {};
  Object.values(blocks || {}).forEach((block, index) => {
    const assetSet = new Set<string>();
    Object.values(block.commands.data).forEach((command) => {
      if (command.assets) {
        command.assets.forEach((a) => {
          assetSet.add(a);
        });
      }
    });
    blockTree[block.reference.refId] = {
      index,
      pos: block.pos,
      line: block.line,
      type: block.type,
      parent: block.reference.parentContainerId,
      children: block.children,
      assets: Array.from(assetSet),
    };
  });
  return blockTree;
};
