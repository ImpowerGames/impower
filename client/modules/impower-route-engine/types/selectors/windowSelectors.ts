import { ContainerType } from "../../../impower-game/data";
import { DataWindowType } from "../state/dataPanelState";

export const getContainerType = (
  windowType: DataWindowType
): ContainerType | undefined => {
  switch (windowType) {
    case DataWindowType.Entities:
      return ContainerType.Construct;
    case DataWindowType.Logic:
      return ContainerType.Block;
    default:
      return undefined;
  }
};
