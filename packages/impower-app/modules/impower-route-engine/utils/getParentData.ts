import {
    GameProjectData,
    InstanceData,
    Reference,
} from "../../../../spark-engine";
import { getData } from "./getData";

export const getParentData = (
  reference: Reference,
  project: GameProjectData
): InstanceData | undefined => {
  let parentReference: Reference = {
    ...reference,
  } as Reference;
  if (reference.parentContainerId) {
    parentReference = {
      refType: reference.parentContainerType,
      refTypeId: "",
      refId: reference.parentContainerId,
    };
  }
  return getData(parentReference, project);
};
