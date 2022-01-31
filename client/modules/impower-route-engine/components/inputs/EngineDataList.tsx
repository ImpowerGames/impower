import React, { useContext, useEffect, useState } from "react";
import { debounce, OrderedCollection } from "../../../impower-core";
import { Alignment } from "../../../impower-react-virtualization";
import DataList from "../../../impower-route/components/inputs/DataList";
import { DataContext } from "../../contexts/dataContext";

interface EngineDataListProps {
  list: OrderedCollection<unknown>;
  levels?: { [id: string]: number };
  allowNestingControl?: boolean;
  itemSize: number;
  scrollToAlignment?: Alignment;
  draggingIds: string[];
  selectedIds: string[];
  changeTargetId?: string;
  search?: string;
  disableReordering?: boolean;
  levelIndent?: number;
  maxLevel?: number;
  overlay?: React.ReactNode;
  forceCenter?: {
    ids: string[];
    instant?: boolean;
  };
  forceScrollToIndex?: {
    index: number;
    transition: string;
  };
  scrollParent?: HTMLElement | null;
  style?: React.CSSProperties;
  onSetDragging: (ids: string[]) => void;
  onSetOrder: (ids: string[], reorderedIds: string[]) => void;
  onSetLevel?: (newLevels: { [id: string]: number }) => void;
  onSetSelection: (ids: string[]) => void;
  onRef?: (instance: HTMLDivElement | null) => void;
  getSearchTargets: (id: string) => string[];
  children: (props: {
    id: string;
    index: number;
    value: unknown;
    currentOrderedIds: string[];
    currentFocusedIds: string[] | null;
    currentSelectedIds: string[];
    currentDraggingIds: string[];
    onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
  }) => JSX.Element | null;
}

const EngineDataList = (props: EngineDataListProps): JSX.Element => {
  const {
    list,
    levels,
    allowNestingControl = false,
    itemSize,
    scrollToAlignment,
    selectedIds,
    draggingIds,
    changeTargetId,
    search,
    disableReordering,
    levelIndent = 32,
    maxLevel = 1,
    style,
    overlay,
    forceCenter,
    forceScrollToIndex,
    scrollParent,
    onSetDragging,
    onSetOrder,
    onSetLevel = (): void => null,
    onSetSelection,
    onRef,
    getSearchTargets,
    children,
  } = props;

  const dataContext = useContext(DataContext);
  const events = dataContext?.events;

  const [currentForceCenter, setCurrentForceCenter] = useState<{
    ids: string[];
    instant?: boolean;
  }>(forceCenter);
  const [currentForceScrollToIndex, setCurrentForceScrollToIndex] = useState<{
    index: number;
    transition: string;
  }>(forceScrollToIndex);

  useEffect(() => {
    setCurrentForceCenter(forceCenter);
  }, [forceCenter]);

  useEffect(() => {
    setCurrentForceScrollToIndex(forceScrollToIndex);
  }, [forceScrollToIndex]);

  useEffect(() => {
    const onFocusDataIds = debounce(
      (data: { ids: string[]; instant?: boolean }): void => {
        setCurrentForceCenter({ ...data });
      },
      200
    );
    if (events) {
      events.onFocusData.addListener(onFocusDataIds);
    }
    return (): void => {
      if (events) {
        events.onFocusData.removeListener(onFocusDataIds);
      }
    };
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentForceCenter) {
      const { ids, instant } = currentForceCenter;
      if (ids.length > 0) {
        const targetIds = list.order.filter((id) => ids.includes(id));
        if (targetIds.length > 0) {
          const id = targetIds[0];
          const index = list.order.indexOf(id);
          if (index > -1) {
            setCurrentForceScrollToIndex({
              index,
              transition: instant ? "" : "0.2s ease",
            });
          }
        }
      }
    }
    // Stop forcing once pane transition is done.
    setCurrentForceCenter(undefined);
  }, [currentForceCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DataList
      virtualize
      list={list}
      levels={levels}
      allowNestingControl={allowNestingControl}
      itemSize={itemSize}
      scrollToAlignment={scrollToAlignment}
      selectedIds={selectedIds}
      draggingIds={draggingIds}
      changeTargetId={changeTargetId}
      search={search}
      disableReordering={disableReordering}
      levelIndent={levelIndent}
      maxLevel={maxLevel}
      overlay={overlay}
      forceScrollToIndex={currentForceScrollToIndex}
      scrollParent={scrollParent}
      style={style}
      onSetDragging={onSetDragging}
      onSetOrder={onSetOrder}
      onSetLevel={onSetLevel}
      onSetSelection={onSetSelection}
      onRef={onRef}
      getSearchTargets={getSearchTargets}
    >
      {children}
    </DataList>
  );
};

export default EngineDataList;
