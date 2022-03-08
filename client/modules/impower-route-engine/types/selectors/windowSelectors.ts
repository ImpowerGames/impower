import { ContainerType } from "../../../impower-game/data";
import { WindowType } from "../state/windowState";

export const getContainerType = (
  windowType: WindowType
): ContainerType | undefined => {
  switch (windowType) {
    case "Entities":
      return "Construct";
    case "Logic":
      return "Block";
    default:
      return undefined;
  }
};
