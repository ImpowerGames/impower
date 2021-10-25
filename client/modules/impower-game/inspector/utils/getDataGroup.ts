import { isNameable } from "../../../impower-core";
import {
  GameProjectData,
  Reference,
  isItemReference,
  isContainerReference,
} from "../../data";
import { getData } from "./getData";
import { getParentData } from "./getParentData";

export const getDataGroup = (
  project: GameProjectData,
  reference: Reference,
  targetContainerId?: string
): string => {
  const parentReference = getParentData(reference, project)?.reference;
  if (
    parentReference &&
    (isItemReference(parentReference) ||
      isContainerReference(parentReference)) &&
    parentReference.parentContainerId !== "" &&
    (!targetContainerId || parentReference.refId !== targetContainerId)
  ) {
    const data = getData(parentReference, project);
    if (data && isNameable(data)) {
      return `${data.name}`;
    }
  }
  return "";
};
