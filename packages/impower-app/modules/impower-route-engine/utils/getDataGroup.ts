import { GameProjectData, Reference } from "../../../../spark-engine";
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
    parentReference.parentContainerId !== "" &&
    (!targetContainerId || parentReference.refId !== targetContainerId)
  ) {
    const data = getData(parentReference, project);
    if (data && "name" in data) {
      return `${data.name}`;
    }
  }
  return "";
};
