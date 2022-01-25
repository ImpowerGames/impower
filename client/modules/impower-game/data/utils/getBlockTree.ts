import { GameProjectData } from "../../project/classes/project/gameProjectData";

export const getBlockTree = (
  project: GameProjectData
): { [blockId: string]: { parent: string; children: string[] } } => {
  const blockTree: {
    [blockId: string]: { parent: string; children: string[] };
  } = {};
  Object.values(project?.instances?.blocks?.data || {}).forEach((block) => {
    blockTree[block.reference.refId] = {
      parent: block.reference.parentContainerId,
      children: block.childContainerIds,
    };
  });
  return blockTree;
};
