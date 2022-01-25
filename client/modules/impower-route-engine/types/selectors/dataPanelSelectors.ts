import { Vector2 } from "../../../impower-core";
import {
  BlockData,
  ConstructData,
  ContainerData,
  ContainerType,
  isBlockData,
  isConstructData,
  isPositionable,
  ItemData,
  ItemType,
  Reference,
} from "../../../impower-game/data";
import {
  DataInteractionType,
  DataPanelState,
  DataPanelType,
  DataWindowType,
  PanelInteractionState,
} from "../state/dataPanelState";

const getChildConstructs = (
  parentConstruct: ConstructData,
  constructs: { [refId: string]: ConstructData }
): { [refId: string]: ConstructData } => {
  const childConstructs: { [refId: string]: ConstructData } = {};
  if (!parentConstruct) {
    return childConstructs;
  }
  parentConstruct.childContainerIds.forEach((refId) => {
    const data = constructs[refId];
    if (data) {
      childConstructs[refId] = data;
    }
  });
  return childConstructs;
};

const getChildBlocks = (
  parentBlock: BlockData,
  blocks: { [refId: string]: BlockData }
): { [refId: string]: BlockData } => {
  const childBlocks: { [refId: string]: BlockData } = {};
  if (!parentBlock) {
    return childBlocks;
  }
  parentBlock.childContainerIds.forEach((refId) => {
    const data = blocks[refId];
    if (data) {
      childBlocks[refId] = data;
    }
  });
  return childBlocks;
};

export const getChildContainers = (
  containerType: ContainerType,
  parentContainerId: string,
  projectContainers: { [refId: string]: ContainerData }
): { [refId: string]: ContainerData } => {
  const parentContainer = projectContainers[parentContainerId];

  switch (containerType) {
    case ContainerType.Construct:
      return getChildConstructs(
        parentContainer as ConstructData,
        projectContainers as { [refId: string]: ConstructData }
      );
    case ContainerType.Block:
      return getChildBlocks(
        parentContainer as BlockData,
        projectContainers as { [refId: string]: BlockData }
      );
    default:
      return {};
  }
};

export const getItems = (
  container: ContainerData,
  itemType: ItemType
): { [refId: string]: ItemData } => {
  if (isConstructData(container)) {
    switch (itemType) {
      case ItemType.Variable:
        return container.variables.data;
      case ItemType.Element:
        return container.elements.data;
      default:
        return {};
    }
  }
  if (isBlockData(container)) {
    switch (itemType) {
      case ItemType.Trigger:
        return container.triggers.data;
      case ItemType.Command:
        return container.commands.data;
      case ItemType.Variable:
        return container.variables.data;
      default:
        return {};
    }
  }
  return {};
};

export const getPositions = (projectContainers: {
  [refId: string]: ContainerData;
}): { [refId: string]: Vector2 } => {
  const positions: { [refId: string]: Vector2 } = {};
  Object.values(projectContainers || {}).forEach((container) => {
    if (isPositionable(container)) {
      positions[container.reference.refId] = container.nodePosition;
    }
  });
  return positions;
};

export const getInsertionIndex = (
  selectedIds: string[],
  dataIds: string[]
): number => {
  const selectedIndices: number[] = [];
  dataIds.forEach((id, index) => {
    if (selectedIds.includes(id)) {
      selectedIndices.push(index);
    }
  });
  return selectedIndices[selectedIndices.length - 1] + 1;
};

export const getInteractionsSelector = (
  state: DataPanelState,
  windowType: DataWindowType,
  interactionType: DataInteractionType,
  panelType: DataPanelType
): (Reference | string)[] => {
  const panelInteractionState: PanelInteractionState =
    state.panels[windowType][panelType];
  return panelInteractionState.interactions[interactionType];
};
