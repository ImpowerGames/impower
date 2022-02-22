import { BlockData } from "../../project/classes/instances/containers/block/blockData";

export const getBlockTree = (
  blocks: Record<string, BlockData>
): {
  [blockId: string]: {
    pos: number;
    line: number;
    parent: string;
    children: string[];
  };
} => {
  const blockTree: {
    [blockId: string]: {
      pos: number;
      line: number;
      parent: string;
      children: string[];
    };
  } = {};
  Object.values(blocks || {}).forEach((block) => {
    blockTree[block.reference.refId] = {
      pos: block.pos,
      line: block.line,
      parent: block.reference.parentContainerId,
      children: block.childContainerIds,
    };
  });
  return blockTree;
};
