import { ContainerType } from "../../data";
import { VariableContainerData } from "../../project/classes/instances/container/variableContainerData";
import { GameProjectData } from "../../project/classes/project/gameProjectData";

export const getVariableContainer = (
  project: GameProjectData,
  containerType: ContainerType,
  containerId: string
): VariableContainerData => {
  switch (containerType) {
    case "Construct": {
      return project?.instances?.constructs.data[containerId];
    }
    case "Block": {
      return project?.instances?.blocks.data[containerId];
    }
    default: {
      throw new Error(
        `Containers of type '${containerType} cannot contain variables'`
      );
    }
  }
};
