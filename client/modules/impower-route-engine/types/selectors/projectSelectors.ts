import {
  ContainerData,
  ContainerType,
  GameProjectData,
} from "../../../impower-game/data";

export const projectContainersSelector = (
  project: GameProjectData,
  containerType: ContainerType
): { [refId: string]: ContainerData } => {
  switch (containerType) {
    case "Construct":
      return project?.instances?.constructs?.data;
    case "Block":
      return project?.instances?.blocks?.data;
    default:
      return {};
  }
};
