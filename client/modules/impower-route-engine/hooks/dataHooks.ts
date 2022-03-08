import { useCallback, useContext, useMemo } from "react";
import {
  ContainerData,
  ContainerReference,
  ItemData,
  ItemReference,
} from "../../impower-game/data";
import { DataContext } from "../contexts/dataContext";
import { getChildContainers } from "../types/selectors/panelSelectors";
import { projectContainersSelector } from "../types/selectors/projectSelectors";
import { getContainerType } from "../types/selectors/windowSelectors";
import { ProjectEngineState } from "../types/state/projectEngineState";
import { WindowType } from "../types/state/windowState";

export const useInspectedContainers = (
  state: ProjectEngineState,
  windowType: WindowType
): { [refId: string]: ContainerData } => {
  const containerType = useMemo(
    () => getContainerType(windowType),
    [windowType]
  );
  const parentContainerId =
    state.panel.panels[windowType].Container.inspectedTargetId;
  const projectContainers = useMemo(
    () => projectContainersSelector(state.project.data, containerType),
    [containerType, state.project.data]
  );
  const projectContainersData = useMemo(() => {
    const data = {};
    Object.entries(projectContainers || {}).forEach(([key, value]) => {
      data[key] = value;
    });
    return data;
  }, [projectContainers]);

  const inspectedContainers = useMemo(
    () =>
      getChildContainers(
        containerType,
        parentContainerId,
        projectContainersData
      ),
    [containerType, parentContainerId, projectContainersData]
  );

  return inspectedContainers;
};

export const useContainerNavigation = (
  state: ProjectEngineState,
  windowType: WindowType,
  targetContainerIds: string[],
  onNavigate: (reference: ContainerReference) => void
): {
  previousContainerId: string;
  nextContainerId: string;
  onPreviousContainer: () => void;
  onNextContainer: () => void;
} => {
  const { events } = useContext(DataContext);

  const containerType = useMemo(
    () => getContainerType(windowType),
    [windowType]
  );
  const parentContainerId =
    state.panel.panels[windowType].Container.inspectedTargetId;
  const projectContainers = useMemo(
    () => projectContainersSelector(state.project.data, containerType),
    [containerType, state.project.data]
  );

  const previousContainerId = useMemo(() => {
    const targetContainerId = targetContainerIds?.[0];
    const parentContainer = projectContainers?.[parentContainerId];
    const currentIndex =
      parentContainer?.childContainerIds?.indexOf(targetContainerId);
    return parentContainer?.childContainerIds?.[currentIndex - 1];
  }, [targetContainerIds, projectContainers, parentContainerId]);
  const nextContainerId = useMemo(() => {
    const targetContainerId =
      targetContainerIds?.[targetContainerIds.length - 1];
    const parentContainer = projectContainers?.[parentContainerId];
    const currentIndex =
      parentContainer?.childContainerIds?.indexOf(targetContainerId);
    return parentContainer?.childContainerIds?.[currentIndex + 1];
  }, [targetContainerIds, projectContainers, parentContainerId]);
  const selectPreviousContainer = useCallback((): void => {
    if (previousContainerId) {
      const previousContainer = projectContainers?.[previousContainerId];
      if (previousContainer) {
        onNavigate(previousContainer.reference);
        events.onFocusData.emit({
          ids: [previousContainer.reference.refId],
        });
      }
    }
  }, [projectContainers, previousContainerId, events, onNavigate]);
  const selectNextContainer = useCallback((): void => {
    if (nextContainerId) {
      const nextContainer = projectContainers[nextContainerId];
      if (nextContainer) {
        onNavigate(nextContainer.reference);
        events.onFocusData.emit({ ids: [nextContainer.reference.refId] });
      }
    }
  }, [projectContainers, nextContainerId, events, onNavigate]);

  return {
    previousContainerId,
    nextContainerId,
    onPreviousContainer: selectPreviousContainer,
    onNextContainer: selectNextContainer,
  };
};

export const useItemNavigation = (
  targetItemIds: string[],
  inspectedItems: { [refId: string]: ItemData },
  onNavigate: (reference: ItemReference) => void
): {
  previousItemId: string;
  nextItemId: string;
  onPreviousItem: () => void;
  onNextItem: () => void;
} => {
  const { events } = useContext(DataContext);

  const previousItemId = useMemo(() => {
    const targetItemId = targetItemIds[0];
    const allItemIds = Object.keys(inspectedItems);
    const currentIndex = allItemIds.indexOf(targetItemId);
    return allItemIds[currentIndex - 1];
  }, [targetItemIds, inspectedItems]);
  const nextItemId = useMemo(() => {
    const targetItemId = targetItemIds[targetItemIds.length - 1];
    const allItemIds = Object.keys(inspectedItems);
    const currentIndex = allItemIds.indexOf(targetItemId);
    return allItemIds[currentIndex + 1];
  }, [targetItemIds, inspectedItems]);
  const selectPreviousItem = useCallback((): void => {
    if (previousItemId) {
      const previousItem = inspectedItems[previousItemId];
      if (previousItem) {
        onNavigate(previousItem.reference);
        events.onFocusData.emit({ ids: [previousItem.reference.refId] });
      }
    }
  }, [inspectedItems, previousItemId, events, onNavigate]);
  const selectNextItem = useCallback((): void => {
    if (nextItemId) {
      const nextItem = inspectedItems[nextItemId];
      if (nextItem) {
        onNavigate(nextItem.reference);
        events.onFocusData.emit({ ids: [nextItem.reference.refId] });
      }
    }
  }, [inspectedItems, nextItemId, events, onNavigate]);

  return {
    previousItemId,
    nextItemId,
    onPreviousItem: selectPreviousItem,
    onNextItem: selectNextItem,
  };
};
