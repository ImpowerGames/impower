import {
  InstanceData,
  isItemReference,
  GameProjectData,
  ContainerType,
  ItemType,
  Reference,
  ConfigType,
  ConfigData,
} from "../../data";
import { getVariableContainer } from "./getVariableContainer";

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
    case ConfigType.Config: {
      const config: ConfigData =
        project?.instances?.configs.data[reference.refId];
      if (config) {
        dict[reference.refId] = config;
      }
      break;
    }
    case ContainerType.Construct: {
      const construct = project?.instances?.constructs.data[reference.refId];
      if (construct) {
        dict[reference.refId] = construct;
        construct.childContainerIds.forEach((childId) => {
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
      return;
    }
    case ContainerType.Block: {
      const block = project?.instances?.blocks.data[reference.refId];
      if (block) {
        dict[reference.refId] = block;
        block.childContainerIds.forEach((childId) => {
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
      return;
    }
    case ItemType.Element: {
      if (isItemReference(reference)) {
        if (reference.parentContainerId) {
          const construct =
            project?.instances?.constructs.data[reference.parentContainerId];
          if (!construct) {
            throw new Error(
              `${reference.parentContainerType} with id '${reference.parentContainerId}' does not exist in project`
            );
          }
          dict[reference.refId] = construct.elements.data[reference.refId];
        }
        const construct = Object.values(
          project?.instances?.constructs.data
        ).find((c) => {
          return c.elements.data[reference.refId];
        });
        if (construct) {
          dict[reference.refId] = construct.elements.data[reference.refId];
        }
      }
      return;
    }
    case ItemType.Trigger: {
      if (isItemReference(reference)) {
        const block =
          project?.instances?.blocks.data[reference.parentContainerId];
        if (!block) {
          throw new Error(
            `${reference.parentContainerType} with id '${reference.parentContainerId}' does not exist in project`
          );
        }
        dict[reference.refId] = block.triggers.data[reference.refId];
      }
      return;
    }
    case ItemType.Command: {
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
      return;
    }
    case ItemType.Variable: {
      if (isItemReference(reference)) {
        if (reference.parentContainerId) {
          const container = getVariableContainer(
            project,
            reference.parentContainerType,
            reference.parentContainerId
          );
          if (!container) {
            throw new Error(
              `${reference.parentContainerType} with id '${reference.parentContainerId}' does not exist in project`
            );
          }
          dict[reference.refId] = container.variables.data[reference.refId];
        }
        if (reference.parentContainerType === ContainerType.Block) {
          const container = Object.values(project?.instances?.blocks.data).find(
            (c) => {
              return c.variables.data[reference.refId];
            }
          );
          if (container) {
            dict[reference.refId] = container.variables.data[reference.refId];
          }
        }
        if (reference.parentContainerType === ContainerType.Construct) {
          const container = Object.values(
            project?.instances?.constructs.data
          ).find((c) => {
            return c.variables.data[reference.refId];
          });
          if (container) {
            dict[reference.refId] = container.variables.data[reference.refId];
          }
        }
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
