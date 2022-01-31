import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styled from "@emotion/styled";
import React, {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { difference, OrderedCollection } from "../../../impower-core";
import {
  Alignment,
  VirtualizedList,
} from "../../../impower-react-virtualization";
import { AccessibleEvent, select } from "../../utils/events";
import { reorder } from "../../utils/order";
import {
  changeSelection,
  multiSelection,
  toggleSelection,
} from "../../utils/selection";
import FadeAnimation from "../animations/FadeAnimation";
import Portal from "../layouts/Portal";

export type Overflow =
  | "auto"
  | "inherit"
  | "initial"
  | "hidden"
  | "-moz-initial"
  | "revert"
  | "unset"
  | "scroll"
  | "visible";

const StyledSortableItem = styled.div``;

interface SortableItemProps {
  id: string;
  active: string;
  dragging: string;
  value: unknown;
  index: number;
  level: number;
  levelIndent: number;
  disabled?: boolean;
  style?: CSSProperties;
  currentOrderedIds: string[];
  currentFocusedIds: string[] | null;
  currentSelectedIds: string[];
  currentDraggingIds: string[];
  onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
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

const SortableItem = (props: SortableItemProps): JSX.Element => {
  const {
    id,
    active,
    value,
    index,
    levelIndent,
    style,
    level,
    currentOrderedIds,
    currentFocusedIds,
    currentSelectedIds,
    currentDraggingIds,
    onDragHandleTrigger,
    children,
  } = props;

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    touchAction: "none",
    opacity: active === id ? 0 : undefined,
    zIndex: 1,
    paddingLeft: level * levelIndent,
    ...style,
  };

  const handleRef = useCallback(
    (instance: HTMLDivElement) => {
      if (instance) {
        setNodeRef(instance);
      }
    },
    [setNodeRef]
  );

  return (
    <StyledSortableItem
      ref={handleRef}
      {...attributes}
      {...listeners}
      style={sortableStyle}
      data-index={index}
    >
      <FadeAnimation>
        {children({
          id,
          index,
          value,
          currentOrderedIds,
          currentFocusedIds,
          currentSelectedIds,
          currentDraggingIds,
          onDragHandleTrigger,
        })}
      </FadeAnimation>
    </StyledSortableItem>
  );
};

interface VirtualSortableListProps {
  values: { [id: string]: unknown };
  levels?: { [id: string]: number };
  levelIndent: number;
  currentOrderedIds: string[];
  currentFocusedIds: string[] | null;
  currentSelectedIds: string[];
  currentDraggingIds: string[];
  itemSize: number;
  overscanCount?: number;
  scrollToIndex?: { index: number; transition: string };
  scrollToAlignment?: Alignment;
  disableReordering?: boolean;
  overlay?: React.ReactNode;
  scrollParent?: HTMLElement | null;
  onScrollToIndex: () => void;
  onRef?: (instance: HTMLDivElement | null) => void;
  onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
  onDragStart?(event: DragStartEvent): void;
  onDragMove?(event: DragMoveEvent): void;
  onDragEnd?(
    event: DragEndEvent,
    sort: { oldIndex: number; newIndex: number }
  ): void;
  children: (props: {
    id: string;
    active: string;
    dragging: string;
    index: number;
    value: unknown;
    level: number;
    levelIndent: number;
    currentOrderedIds: string[];
    currentFocusedIds: string[] | null;
    currentSelectedIds: string[];
    currentDraggingIds: string[];
    onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
  }) => JSX.Element | null;
}

const VirtualSortableList = (props: VirtualSortableListProps): JSX.Element => {
  const {
    values,
    levels,
    levelIndent,
    currentOrderedIds,
    currentFocusedIds,
    currentSelectedIds,
    currentDraggingIds,
    itemSize,
    overscanCount,
    scrollToIndex,
    scrollToAlignment,
    disableReordering,
    overlay,
    scrollParent,
    onScrollToIndex,
    onDragHandleTrigger,
    onDragStart,
    onDragMove,
    onDragEnd,
    onRef,
    children,
  } = props;

  const [active, setActive] = useState<string>();
  const [dragging, setDragging] = useState<string>();

  const items = useMemo(() => Object.keys(values), [values]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const modifiers = useMemo(
    () => [restrictToVerticalAxis, restrictToParentElement],
    []
  );

  const strategy = useMemo(() => verticalListSortingStrategy, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActive(event.active.id);
      if (onDragStart) {
        onDragStart(event);
      }
    },
    [onDragStart]
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      setDragging(event.active.id);
      if (onDragMove) {
        onDragMove(event);
      }
    },
    [onDragMove]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over.id) {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        if (onDragEnd) {
          onDragEnd(event, { oldIndex, newIndex });
        }
      }
      setActive(null);
      setDragging(null);
    },
    [onDragEnd, items]
  );

  return (
    <DndContext
      sensors={sensors}
      modifiers={modifiers}
      autoScroll
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={strategy}>
        <VirtualizedList
          scrollParent={scrollParent}
          itemSize={itemSize}
          itemCount={currentOrderedIds.length}
          overscanCount={overscanCount}
          scrollToIndex={scrollToIndex}
          scrollToAlignment={scrollToAlignment}
          onScrollToIndex={onScrollToIndex}
          onRef={onRef}
          overlay={overlay}
        >
          {({ index, style }): JSX.Element => {
            const id = currentOrderedIds[index];
            if (!id) {
              return null;
            }
            const value = values[id];
            const level = levels?.[id] || 0;
            if (value === undefined) {
              return null;
            }
            return (
              <SortableItem
                key={id}
                active={active}
                dragging={dragging}
                index={index}
                level={level}
                levelIndent={levelIndent}
                style={style}
                id={id}
                value={value}
                currentOrderedIds={currentOrderedIds}
                currentFocusedIds={currentFocusedIds}
                currentSelectedIds={currentSelectedIds}
                currentDraggingIds={currentDraggingIds}
                onDragHandleTrigger={onDragHandleTrigger}
                disabled={disableReordering}
              >
                {children}
              </SortableItem>
            );
          }}
        </VirtualizedList>
      </SortableContext>
      <Portal>
        <DragOverlay dropAnimation={null} zIndex={10000}>
          {active
            ? children({
                id: active,
                active,
                dragging,
                index: items.indexOf(active),
                level: levels?.[active] || 0,
                levelIndent,
                value: values[active],
                currentOrderedIds,
                currentFocusedIds,
                currentSelectedIds,
                currentDraggingIds,
                onDragHandleTrigger,
              })
            : null}
        </DragOverlay>
      </Portal>
    </DndContext>
  );
};

interface SortableListProps {
  values: { [id: string]: unknown };
  levels?: { [id: string]: number };
  levelIndent: number;
  currentOrderedIds: string[];
  currentFocusedIds: string[] | null;
  currentSelectedIds: string[];
  currentDraggingIds: string[];
  disableReordering?: boolean;
  onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
  onDragStart?(event: DragStartEvent): void;
  onDragMove?(event: DragMoveEvent): void;
  onDragEnd?(
    event: DragEndEvent,
    sort: { oldIndex: number; newIndex: number }
  ): void;
  children: (props: {
    id: string;
    active: string;
    dragging: string;
    index: number;
    value: unknown;
    level: number;
    levelIndent: number;
    currentOrderedIds: string[];
    currentFocusedIds: string[] | null;
    currentSelectedIds: string[];
    currentDraggingIds: string[];
    onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
  }) => JSX.Element | null;
  onRef?: (instance: HTMLDivElement | null) => void;
}

const SortableList = (props: SortableListProps): JSX.Element => {
  const {
    values,
    levels,
    levelIndent,
    currentOrderedIds,
    currentFocusedIds,
    currentSelectedIds,
    currentDraggingIds,
    disableReordering,
    onDragHandleTrigger,
    onDragStart,
    onDragMove,
    onDragEnd,
    onRef,
    children,
  } = props;

  const [active, setActive] = useState<string>();
  const [dragging, setDragging] = useState<string>();

  const items = useMemo(() => Object.keys(values), [values]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const modifiers = useMemo(
    () => [restrictToVerticalAxis, restrictToParentElement],
    []
  );

  const strategy = useMemo(() => verticalListSortingStrategy, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActive(event.active.id);
      if (onDragStart) {
        onDragStart(event);
      }
    },
    [onDragStart]
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      setDragging(event.active.id);
      if (onDragMove) {
        onDragMove(event);
      }
    },
    [onDragMove]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (active.id !== over.id) {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        if (onDragEnd) {
          onDragEnd(event, { oldIndex, newIndex });
        }
      }
      setActive(null);
      setDragging(null);
    },
    [onDragEnd, items]
  );

  return (
    <DndContext
      sensors={sensors}
      modifiers={modifiers}
      autoScroll
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={strategy}>
        <div ref={onRef}>
          {({ index, style }): JSX.Element => {
            const id = currentOrderedIds[index];
            if (!id) {
              return null;
            }
            const value = values[id];
            const level = levels?.[id] || 0;
            if (value === undefined) {
              return null;
            }
            return (
              <SortableItem
                key={id}
                active={active}
                dragging={dragging}
                index={index}
                level={level}
                levelIndent={levelIndent}
                style={style}
                id={id}
                value={value}
                currentOrderedIds={currentOrderedIds}
                currentFocusedIds={currentFocusedIds}
                currentSelectedIds={currentSelectedIds}
                currentDraggingIds={currentDraggingIds}
                onDragHandleTrigger={onDragHandleTrigger}
                disabled={disableReordering}
              >
                {children}
              </SortableItem>
            );
          }}
        </div>
      </SortableContext>
      <Portal>
        <DragOverlay dropAnimation={null} zIndex={10000}>
          {active
            ? children({
                id: active,
                active,
                dragging,
                index: items.indexOf(active),
                level: levels?.[active] || 0,
                levelIndent,
                value: values[active],
                currentOrderedIds,
                currentFocusedIds,
                currentSelectedIds,
                currentDraggingIds,
                onDragHandleTrigger,
              })
            : null}
        </DragOverlay>
      </Portal>
    </DndContext>
  );
};

const StyledDataList = styled.div``;

const StyledOverlayArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
`;

interface DataListProps {
  list: OrderedCollection<unknown>;
  levels?: { [id: string]: number };
  allowNestingControl?: boolean;
  virtualize?: boolean;
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
    level: number;
    levelIndent: number;
    currentOrderedIds: string[];
    currentFocusedIds: string[] | null;
    currentSelectedIds: string[];
    currentDraggingIds: string[];
    onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
  }) => JSX.Element | null;
}

const DataList = (props: DataListProps): JSX.Element => {
  const {
    list,
    levels,
    allowNestingControl = false,
    virtualize,
    itemSize,
    scrollToAlignment,
    selectedIds,
    draggingIds,
    changeTargetId,
    search,
    disableReordering,
    levelIndent = 32,
    maxLevel = 1,
    overlay,
    forceScrollToIndex,
    scrollParent,
    style,
    onSetDragging,
    onSetOrder,
    onSetLevel = (): void => null,
    onSetSelection,
    onRef,
    getSearchTargets,
    children,
  } = props;

  const [currentForceScrollToIndex, setCurrentForceScrollToIndex] = useState<{
    index: number;
    transition: string;
  }>(forceScrollToIndex);
  const [currentOrderedIds, setCurrentOrderedIds] = useState(list.order);
  const [currentFocusedIds, setCurrentFocusedIds] = useState<string[] | null>(
    null
  );
  const [currentSelectedIds, setCurrentSelectedIds] = useState<string[]>([
    ...selectedIds,
  ]);
  const allowDrag = useRef(false);
  const startClientX = useRef<number>(0);
  const endClientX = useRef<number>(0);

  const handleSortStart = useCallback(
    (event: DragStartEvent): void => {
      const { id } = event.active;
      const allIds = currentOrderedIds;
      const newSelection = select(
        event as unknown as AccessibleEvent,
        () => changeSelection(id, currentSelectedIds),
        () => toggleSelection(id, currentSelectedIds),
        () => multiSelection(id, currentSelectedIds, allIds)
      );
      setCurrentSelectedIds(newSelection);
      onSetSelection(newSelection);
      if (!draggingIds.includes(id)) {
        onSetDragging([id]);
      }
      startClientX.current =
        event?.active?.rect?.current?.translated?.offsetLeft || 0;
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    },
    [
      currentSelectedIds,
      draggingIds,
      currentOrderedIds,
      onSetSelection,
      onSetDragging,
    ]
  );

  const handleSortMove = useCallback((event: DragMoveEvent): void => {
    endClientX.current =
      event?.active?.rect?.current?.translated?.offsetLeft || 0;
  }, []);

  const handleSortEnd = useCallback(
    (
      _event: DragEndEvent,
      sort: { oldIndex: number; newIndex: number }
    ): void => {
      const { oldIndex, newIndex } = sort;
      onSetDragging([]);
      allowDrag.current = false;
      let newOrderedIds = currentOrderedIds;
      if (oldIndex !== newIndex) {
        newOrderedIds = reorder(
          currentOrderedIds,
          currentSelectedIds,
          oldIndex,
          newIndex
        );
        onSetOrder(newOrderedIds, currentSelectedIds);
        setCurrentOrderedIds(newOrderedIds);
      }
      if (allowNestingControl && levels) {
        let prevNotSelectedIndex = -1;
        const startIndex = newIndex > oldIndex ? newIndex : newIndex - 1;
        for (let i = startIndex; i >= 0; i -= 1) {
          if (!currentSelectedIds.includes(currentOrderedIds[i])) {
            prevNotSelectedIndex = i;
            break;
          }
        }
        const prevNotSelectedId = currentOrderedIds[prevNotSelectedIndex];
        const prevNotSelectedLevel = levels[prevNotSelectedId];
        const xDistance = endClientX.current - startClientX.current;
        const levelDistanceDifference = Math.round(xDistance / levelIndent);
        const firstSelectedId =
          currentOrderedIds.find((id) => currentSelectedIds.includes(id)) || "";
        const oldFirstLevel = levels[firstSelectedId];
        let newFirstLevel = oldFirstLevel + levelDistanceDifference;
        newFirstLevel = Math.max(0, newFirstLevel);
        newFirstLevel = Math.min(
          (prevNotSelectedLevel === undefined ? -1 : prevNotSelectedLevel) + 1,
          newFirstLevel
        );
        newFirstLevel = Math.min(maxLevel, newFirstLevel);
        const firstLevelDifference = newFirstLevel - oldFirstLevel;
        const newLevels: { [id: string]: number } = {};
        currentSelectedIds.forEach((selectedId) => {
          const oldLevel = levels[selectedId];
          const newLevel = oldLevel + firstLevelDifference;
          newLevels[selectedId] = newLevel;
        });
        const updatedLevels = { ...levels, ...newLevels };
        newOrderedIds.forEach((id, index) => {
          const prevId = newOrderedIds[index - 1] || "";
          const prevLevel = updatedLevels[prevId];
          const level = updatedLevels[id];
          if (prevLevel !== undefined && level - prevLevel > 1) {
            const validLevel = prevLevel + 1;
            newLevels[id] = validLevel;
            updatedLevels[id] = validLevel;
          }
        });
        onSetLevel(newLevels);
      }
    },
    [
      currentOrderedIds,
      currentSelectedIds,
      levels,
      allowNestingControl,
      levelIndent,
      maxLevel,
      onSetDragging,
      onSetOrder,
      onSetLevel,
    ]
  );

  const handleDragHandleTrigger = useCallback(
    (_event: PointerEvent | React.PointerEvent): void => {
      allowDrag.current = true;
    },
    []
  );

  const handleForcedScrollToIndex = useCallback(() => {
    setCurrentForceScrollToIndex(undefined);
  }, []);

  useEffect(() => {
    setCurrentForceScrollToIndex(forceScrollToIndex);
  }, [forceScrollToIndex]);

  useEffect(() => {
    const newOrderedIds = list.order;
    const removeDifference = difference(currentOrderedIds, newOrderedIds);
    if (removeDifference.length > 0) {
      const firstId = removeDifference[0];
      const index = currentOrderedIds.indexOf(firstId);
      if (index > -1) {
        setCurrentForceScrollToIndex({
          index: index - 1,
          transition: "0.2s ease",
        });
      }
    }
    setCurrentOrderedIds(newOrderedIds);
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (search === "") {
      onSetSelection([]);
    }
    const newOrderedIds = list.order;
    if (search) {
      const filteredIds = newOrderedIds.filter((id) =>
        getSearchTargets(id).some(
          (target) => target.toLowerCase().search(search.toLowerCase()) > -1
        )
      );
      onSetSelection(filteredIds);
      setCurrentFocusedIds(filteredIds);
    } else {
      setCurrentFocusedIds(null);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (changeTargetId) {
      setCurrentFocusedIds([changeTargetId]);
    } else {
      setCurrentFocusedIds(null);
    }
  }, [changeTargetId]);

  useEffect(() => {
    if (currentFocusedIds) {
      if (currentFocusedIds.length > 0) {
        const index = currentOrderedIds.indexOf(currentFocusedIds[0]);
        if (index > -1) {
          setCurrentForceScrollToIndex({ index, transition: "0.2s ease" });
        }
      }
    }
  }, [currentFocusedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentSelectedIds([...selectedIds]);
  }, [selectedIds]);

  const overscanCount = 10;

  return (
    <StyledDataList style={style}>
      {!virtualize && (
        <SortableList
          values={list.data}
          levels={levels}
          levelIndent={levelIndent}
          currentOrderedIds={currentOrderedIds}
          currentFocusedIds={currentFocusedIds}
          currentSelectedIds={currentSelectedIds}
          currentDraggingIds={draggingIds}
          disableReordering={disableReordering}
          onDragHandleTrigger={handleDragHandleTrigger}
          onDragStart={handleSortStart}
          onDragMove={handleSortMove}
          onDragEnd={handleSortEnd}
          onRef={onRef}
        >
          {children}
        </SortableList>
      )}
      {virtualize && (
        <VirtualSortableList
          values={list.data}
          levels={levels}
          levelIndent={levelIndent}
          currentOrderedIds={currentOrderedIds}
          currentFocusedIds={currentFocusedIds}
          currentSelectedIds={currentSelectedIds}
          currentDraggingIds={draggingIds}
          itemSize={itemSize}
          overscanCount={overscanCount}
          scrollToIndex={currentForceScrollToIndex}
          scrollToAlignment={scrollToAlignment}
          disableReordering={disableReordering}
          scrollParent={scrollParent}
          onDragHandleTrigger={handleDragHandleTrigger}
          onDragStart={handleSortStart}
          onDragMove={handleSortMove}
          onDragEnd={handleSortEnd}
          onScrollToIndex={handleForcedScrollToIndex}
          onRef={onRef}
        >
          {children}
        </VirtualSortableList>
      )}
      {overlay && <StyledOverlayArea>{overlay}</StyledOverlayArea>}
    </StyledDataList>
  );
};

export default DataList;
