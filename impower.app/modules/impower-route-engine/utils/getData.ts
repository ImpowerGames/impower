import {
  GameProjectData,
  InstanceData,
  Reference,
} from "../../../../spark-engine";

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
    default:
      return undefined;
  }
  return undefined;
};
