import {
  GameProjectData,
  InstanceData,
  isItemReference,
  Reference,
} from "../../data";

export const getData = (
  reference: Reference,
  project: GameProjectData
): InstanceData => {
  if (!project) {
    return undefined;
  }
  if (!reference) {
    throw new Error(`No reference specified`);
  }
  if (!reference.refId) {
    return undefined;
  }
  switch (reference.refType) {
    case "Config": {
      return project?.instances?.configs?.data[reference.refId];
    }
    case "Block":
      return project?.instances?.blocks?.data[reference.refId];
    case "Command": {
      if (isItemReference(reference)) {
        const block =
          project?.instances?.blocks?.data[reference.parentContainerId];
        if (!block) {
          return undefined;
        }
        return block.commands?.data[reference.refId];
      }
      return undefined;
    }
    default:
      return undefined;
  }
  return undefined;
};
