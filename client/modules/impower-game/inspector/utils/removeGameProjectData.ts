import {
  removeData,
  removeIds,
  removeOrderedCollectionData,
  groupBy,
} from "../../../impower-core";
import {
  GameProjectData,
  isContainerReference,
  isItemReference,
  Reference,
  ParentLookup,
  ItemType,
  ContainerType,
  InstanceData,
  ConfigType,
  ConfigDataCollection,
} from "../../data";
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

  const groupedDeletedReferences = groupBy(deletedReferences, (r: Reference) =>
    isContainerReference(r) || isItemReference(r) ? r.parentContainerId : ""
  );

  Object.values(groupedDeletedReferences).forEach((deletedReferencesList) => {
    const firstRemovedReference = deletedReferencesList[0];
    const parent = {
      ...firstRemovedReference,
    } as ParentLookup;
    const { refType } = firstRemovedReference;
    const ids = deletedReferencesList.map((r) => r.refId);

    switch (refType) {
      case ConfigType.Config: {
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
      case ContainerType.Construct: {
        const newConstructDocs = removeData(
          newProject?.instances?.constructs?.data,
          ids
        );
        if (newConstructDocs[parent.parentContainerId]) {
          newConstructDocs[parent.parentContainerId] = {
            ...newConstructDocs[parent.parentContainerId],
            childContainerIds: removeIds(
              newConstructDocs[parent.parentContainerId].childContainerIds,
              ids
            ),
          };
        }
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            constructs: {
              ...newProject?.instances?.constructs,
              data: newConstructDocs,
            },
          },
        };
        updated[parent.parentContainerId] =
          newProject?.instances?.constructs?.data[parent.parentContainerId];
        original[parent.parentContainerId] =
          project?.instances?.constructs?.data[parent.parentContainerId];
        break;
      }
      case ContainerType.Block: {
        const newBlockDocs = removeData(
          newProject?.instances?.blocks?.data,
          ids
        );
        if (newBlockDocs[parent.parentContainerId]) {
          newBlockDocs[parent.parentContainerId] = {
            ...newBlockDocs[parent.parentContainerId],
            childContainerIds: removeIds(
              newBlockDocs[parent.parentContainerId].childContainerIds,
              ids
            ),
          };
        }
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            blocks: {
              ...newProject?.instances?.blocks,
              data: newBlockDocs,
            },
          },
        };
        updated[parent.parentContainerId] =
          newProject?.instances?.blocks?.data[parent.parentContainerId];
        original[parent.parentContainerId] =
          project?.instances?.blocks?.data[parent.parentContainerId];
        break;
      }
      case ItemType.Element: {
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            constructs: {
              ...newProject?.instances?.constructs,
              data: {
                ...newProject?.instances?.constructs?.data,
                [parent.parentContainerId]: {
                  ...newProject?.instances?.constructs?.data[
                    parent.parentContainerId
                  ],
                  elements: removeOrderedCollectionData(
                    newProject?.instances?.constructs?.data[
                      parent.parentContainerId
                    ].elements,
                    ids
                  ),
                },
              },
            },
          },
        };
        updated[parent.parentContainerId] =
          newProject?.instances?.constructs?.data[parent.parentContainerId];
        original[parent.parentContainerId] =
          project?.instances?.constructs?.data[parent.parentContainerId];
        break;
      }
      case ItemType.Trigger: {
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            blocks: {
              ...newProject?.instances?.blocks,
              data: {
                ...newProject?.instances?.blocks?.data,
                [parent.parentContainerId]: {
                  ...newProject?.instances?.blocks?.data[
                    parent.parentContainerId
                  ],
                  triggers: removeOrderedCollectionData(
                    newProject?.instances?.blocks?.data[
                      parent.parentContainerId
                    ].triggers,
                    ids
                  ),
                },
              },
            },
          },
        };
        updated[parent.parentContainerId] =
          newProject?.instances?.blocks?.data[parent.parentContainerId];
        original[parent.parentContainerId] =
          project?.instances?.blocks?.data[parent.parentContainerId];
        break;
      }
      case ItemType.Command: {
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            blocks: {
              ...newProject?.instances?.blocks,
              data: {
                ...newProject?.instances?.blocks?.data,
                [parent.parentContainerId]: {
                  ...newProject?.instances?.blocks?.data[
                    parent.parentContainerId
                  ],
                  commands: removeOrderedCollectionData(
                    newProject?.instances?.blocks?.data[
                      parent.parentContainerId
                    ].commands,
                    ids
                  ),
                },
              },
            },
          },
        };
        updated[parent.parentContainerId] =
          newProject?.instances?.blocks?.data[parent.parentContainerId];
        original[parent.parentContainerId] =
          project?.instances?.blocks?.data[parent.parentContainerId];
        break;
      }
      case ItemType.Variable: {
        switch (parent.parentContainerType) {
          case ContainerType.Construct: {
            newProject = {
              ...newProject,
              instances: {
                ...newProject?.instances,
                constructs: {
                  ...newProject?.instances?.constructs,
                  data: {
                    ...newProject?.instances?.constructs?.data,
                    [parent.parentContainerId]: {
                      ...newProject?.instances?.constructs?.data[
                        parent.parentContainerId
                      ],
                      variables: removeOrderedCollectionData(
                        newProject?.instances?.constructs?.data[
                          parent.parentContainerId
                        ]?.variables,
                        ids
                      ),
                    },
                  },
                },
              },
            };
            updated[parent.parentContainerId] =
              newProject?.instances?.constructs?.data[parent.parentContainerId];
            original[parent.parentContainerId] =
              project?.instances?.constructs?.data[parent.parentContainerId];
            break;
          }
          case ContainerType.Block: {
            newProject = {
              ...newProject,
              instances: {
                ...newProject?.instances,
                blocks: {
                  ...newProject?.instances?.blocks,
                  data: {
                    ...newProject?.instances?.blocks?.data,
                    [parent.parentContainerId]: {
                      ...newProject?.instances?.blocks?.data[
                        parent.parentContainerId
                      ],
                      variables: removeOrderedCollectionData(
                        newProject?.instances?.blocks?.data[
                          parent.parentContainerId
                        ].variables,
                        ids
                      ),
                    },
                  },
                },
              },
            };
            updated[parent.parentContainerId] =
              newProject?.instances?.blocks?.data[parent.parentContainerId];
            original[parent.parentContainerId] =
              project?.instances?.blocks?.data[parent.parentContainerId];
            break;
          }
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
  });

  return { newProject, deleted, updated, original };
};
