import {
  ConfigData,
  GameProjectData,
  InstanceData,
  isItemReference,
  Reference,
} from "../../data";

const getNestedDataInternal = (
  dict: { [refId: string]: InstanceData },
  reference: Reference,
  project: GameProjectData
): void => {
  if (!reference) {
    throw new Error(`No reference specified`);
  }
  if (!reference.refId) {
    return;
  }
  switch (reference.refType) {
    case "Config": {
      const config: ConfigData =
        project?.instances?.configs.data[reference.refId];
      if (config) {
        dict[reference.refId] = config;
      }
      break;
    }
    case "Block": {
      const block = project?.instances?.blocks.data[reference.refId];
      if (block) {
        dict[reference.refId] = block;
        block.children?.forEach((childId) => {
          getNestedDataInternal(
            dict,
            {
              ...reference,
              parentContainerId: reference.refId,
              refId: childId,
            },
            project
          );
        });
      }
      break;
    }
    case "Command": {
      if (isItemReference(reference)) {
        const block =
          project?.instances?.blocks.data[reference.parentContainerId];
        if (!block) {
          throw new Error(
            `${reference.parentContainerType} with id '${reference.parentContainerId}' does not exist in project`
          );
        }
        dict[reference.refId] = block.commands.data[reference.refId];
      }
      break;
    }
    default:
      break;
  }
};

const getAllNestedDataInternal = (
  dict: { [refId: string]: InstanceData },
  references: Reference[],
  project: GameProjectData
): void => {
  references.forEach((reference) => {
    getNestedDataInternal(dict, reference, project);
  });
};

export const getAllNestedData = (
  references: Reference[],
  project: GameProjectData
): { [refId: string]: InstanceData } => {
  const dict: { [refId: string]: InstanceData } = {};
  getAllNestedDataInternal(dict, references, project);
  return dict;
};
