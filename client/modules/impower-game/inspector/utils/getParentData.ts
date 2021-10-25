import { getData } from "./getData";
import {
  isScopable,
  Reference,
  isItemReference,
  isContainerReference,
  GameProjectData,
  InstanceData,
  FileData,
  FolderData,
} from "../../data";

export const getParentData = (
  reference: Reference,
  project: GameProjectData
): InstanceData | FileData | FolderData | undefined => {
  const data = getData(reference, project);
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
  if (isScopable(data)) {
    parentReference.refId = data.overrideParentContainerId;
  }
  return getData(parentReference, project);
};
