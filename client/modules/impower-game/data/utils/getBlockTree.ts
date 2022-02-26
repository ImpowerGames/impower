import { BlockData } from "../../project/classes/instances/containers/block/blockData";

export const getBlockTree = (
  blocks: Record<string, BlockData>
): {
  [blockId: string]: {
    index: number;
    pos: number;
    line: number;
    triggerable: boolean;
    parent: string;
    children: string[];
  };
} => {
  const blockTree: {
    [blockId: string]: {
      index: number;
      pos: number;
      line: number;
      triggerable: boolean;
      parent: string;
      children: string[];
    };
  } = {};
  Object.values(blocks || {}).forEach((block, index) => {
    blockTree[block.reference.refId] = {
      index,
      pos: block.pos,
      line: block.line,
      triggerable: block.triggers?.order?.length > 0,
      parent: block.reference.parentContainerId,
      children: block.childContainerIds,
    };
  });
  return blockTree;
};
