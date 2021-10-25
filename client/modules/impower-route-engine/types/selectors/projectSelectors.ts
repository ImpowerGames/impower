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
    case ContainerType.Construct:
      return project?.instances?.constructs?.data;
    case ContainerType.Block:
      return project?.instances?.blocks?.data;
    default:
      return {};
  }
};
