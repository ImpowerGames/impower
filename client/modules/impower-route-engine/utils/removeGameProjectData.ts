import {
  ConfigDataCollection,
  GameProjectData,
  InstanceData,
  Reference,
} from "../../../../spark-engine";
import { groupBy, removeData } from "../../impower-core";
import { getAllNestedData } from "./getAllNestedData";

export const removeGameProjectData = (
  project: GameProjectData,
  references: Reference[]
): {
  newProject: GameProjectData;
  deleted: { [refId: string]: InstanceData };
  updated: { [refId: string]: InstanceData };
  original: { [refId: string]: InstanceData };
} => {
  let newProject = { ...project };
  const updated: { [refId: string]: InstanceData } = {};
  const original: { [refId: string]: InstanceData } = {};

  const deleted = getAllNestedData(references, project);
  const deletedReferences = Object.values(deleted).map((d) => d.reference);

  const groupedDeletedReferences = groupBy(
    deletedReferences,
    (r: Reference) => r.parentContainerId || ""
  );

  Object.values(groupedDeletedReferences).forEach((deletedReferencesList) => {
    const firstRemovedReference = deletedReferencesList[0];
    const { refType } = firstRemovedReference;
    const ids = deletedReferencesList.map((r) => r.refId);

    switch (refType) {
      case "Config": {
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            configs: {
              ...newProject?.instances?.configs,
              data: removeData(newProject?.instances?.configs?.data, ids),
            } as ConfigDataCollection,
          },
        };
        break;
      }
      default:
        break;
    }
  });

  return { newProject, deleted, updated, original };
};
