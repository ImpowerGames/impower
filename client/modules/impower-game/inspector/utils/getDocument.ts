import { GameProjectData, InstanceData, Reference } from "../../data";

export const getParentData = (
  reference: Reference,
  project: GameProjectData
): InstanceData | undefined => {
  if (!project) {
    return undefined;
  }
  if (!project.instances) {
    return undefined;
  }
  if (!reference) {
    throw new Error(`No reference specified`);
  }
  if (!reference.refId) {
    return undefined;
  }
  switch (reference.refType) {
    case "Config":
      return project.instances.configs.data[reference.refId];
    case "Block":
      return project.instances.blocks.data[reference.refId];
    case "Command":
      return project.instances.blocks.data[reference.parentContainerId];
    default:
      return undefined;
  }
};
