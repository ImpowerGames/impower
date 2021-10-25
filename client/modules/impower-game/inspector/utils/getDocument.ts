import {
  Reference,
  GameProjectData,
  ContainerType,
  ItemType,
  ConfigType,
  InstanceData,
} from "../../data";

export const getParentData = (
  reference: Reference,
  project: GameProjectData
): InstanceData | undefined => {
  if (!project) {
    return undefined;
  }
  if (!project.instances) {
    return undefined;
  }
  if (!reference) {
    throw new Error(`No reference specified`);
  }
  if (!reference.refId) {
    return undefined;
  }
  switch (reference.refType) {
    case ConfigType.Config:
      return project.instances.configs.data[reference.refId];
    case ContainerType.Construct:
      return project.instances.constructs.data[reference.refId];
    case ContainerType.Block:
      return project.instances.blocks.data[reference.refId];
    case ItemType.Element:
      return project.instances.constructs.data[reference.parentContainerId];
    case ItemType.Trigger:
      return project.instances.blocks.data[reference.parentContainerId];
    case ItemType.Command:
      return project.instances.blocks.data[reference.parentContainerId];
    case ItemType.Variable: {
      switch (reference.parentContainerType) {
        case ContainerType.Block:
          return project.instances.blocks.data[reference.refId];
        case ContainerType.Construct:
          return project.instances.constructs.data[reference.refId];
        default:
          return undefined;
      }
    }
    default:
      return undefined;
  }
};
