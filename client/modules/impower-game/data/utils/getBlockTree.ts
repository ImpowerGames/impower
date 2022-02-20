import { BlockData } from "../../project/classes/instances/containers/block/blockData";

export const getBlockTree = (
  blocks: Record<string, BlockData>
): { [blockId: string]: { parent: string; children: string[] } } => {
  const blockTree: {
    [blockId: string]: { parent: string; children: string[] };
  } = {};
  Object.values(blocks || {}).forEach((block) => {
    blockTree[block.reference.refId] = {
      parent: block.reference.parentContainerId,
      children: block.childContainerIds,
    };
  });
  return blockTree;
};
