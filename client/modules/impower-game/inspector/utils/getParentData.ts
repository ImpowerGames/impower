import {
  GameProjectData,
  InstanceData,
  isContainerReference,
  isItemReference,
  Reference,
} from "../../data";
import { getData } from "./getData";

export const getParentData = (
  reference: Reference,
  project: GameProjectData
): InstanceData | undefined => {
  let parentReference: Reference = {
    ...reference,
  } as Reference;
  if (isItemReference(reference) && reference.parentContainerId) {
    parentReference = {
      refType: reference.parentContainerType,
      refTypeId: "",
      refId: reference.parentContainerId,
    };
  } else if (isContainerReference(reference) && reference.parentContainerId) {
    parentReference = {
      refType: reference.parentContainerType,
      refTypeId: "",
      refId: reference.parentContainerId,
    };
  }
  return getData(parentReference, project);
};
