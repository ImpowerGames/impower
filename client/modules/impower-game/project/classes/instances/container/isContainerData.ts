import { isContainerReference } from "../../../../data/utils/isContainerReference";
import { ContainerData } from "./containerData";

export const isContainerData = (obj: unknown): obj is ContainerData => {
  if (!obj) {
    return false;
  }
  const containerData = obj as ContainerData;
  return (
    isContainerReference(containerData.reference) &&
    containerData.children !== undefined
  );
};
