import styled from "@emotion/styled";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { debounce, difference } from "../../../impower-core";
import {
  Chart,
  Flowchart,
  FlowchartNode,
  getCenteredFlowchart,
  getRect,
  getRectCenter,
  LinkDefaultProps,
  Node,
  OnPanCanvas,
  OnZoomCanvas,
  Vector2,
} from "../../../impower-react-flowchart";
import {
  ButtonShape,
  changeSelection,
  multiSelection,
  select,
  toggleSelection,
  TransitionState,
} from "../../../impower-route";
import DataTransition from "../../../impower-route/components/animations/DataTransition";
import { DataContext } from "../../contexts/dataContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import { DataButtonInfo } from "../../types/info/buttons";
import { chartSize, containerChartConfig } from "../../types/info/charts";
import { DataLink } from "./DataLink";

const defaultNodeSize = { x: 144, y: 40 };

const getInitialNodePositions = (
  newNodes: {
    [id: string]: Node;
  },
  oldPositions?: {
    [id: string]: Vector2;
  }
): { [id: string]: Vector2 } => {
  const nodePositions: {
    [id: string]: Vector2;
  } = {};
  Object.keys(newNodes).forEach((id) => {
    nodePositions[id] = newNodes[id].defaultPosition || oldPositions?.[id];
  });
  return nodePositions;
};

const getInitialNodeSizes = (
  newNodes: {
    [id: string]: Node;
  },
  oldSizes?: {
    [id: string]: Vector2;
  }
): { [id: string]: Vector2 } => {
  const nodeSizes: {
    [id: string]: Vector2;
  } = {};
  Object.keys(newNodes).forEach((id) => {
    nodeSizes[id] = oldSizes?.[id] || defaultNodeSize;
  });
  return nodeSizes;
};

const StyledFlowchart = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
`;

export interface DataChartProps {
  chart: Chart;
  infos: { [id: string]: DataButtonInfo };
  selectedIds: string[];
  draggingIds: string[];
  changeTargetId?: string;
  shape: ButtonShape;
  search?: string;
  fadeDelay?: number;
  scrollParent?: HTMLElement | null;
  chartAreaRef?: React.Ref<HTMLDivElement>;
  onPanCanvas: OnPanCanvas;
  onZoomCanvas: OnZoomCanvas;
  onSetNodePositions: (positions: { [id: string]: Vector2 }) => void;
  onSetDragging: (ids: string[]) => void;
  onSetSelection: (ids: string[]) => void;
  children: (props: {
    id: string;
    index: number;
    value: unknown;
    currentOrderedIds: string[];
    currentFocusedIds: string[] | null;
    currentSelectedIds: string[];
    currentDraggingIds: string[];
  }) => JSX.Element | null;
}

const DataChart = (props: DataChartProps): JSX.Element => {
  const {
    chart,
    infos,
    selectedIds,
    draggingIds,
    changeTargetId,
    search,
    fadeDelay = 500,
    scrollParent,
    chartAreaRef,
    onPanCanvas,
    onZoomCanvas,
    onSetNodePositions,
    onSetDragging,
    onSetSelection,
    children,
  } = props;

  const { transitionState } = useContext(WindowTransitionContext);
  const { events } = useContext(DataContext);

  const [visible, setVisible] = useState<boolean>(false);
  const [defaultScale, setDefaultScale] = useState<number>(1);
  const [defaultOffset, setDefaultOffset] = useState<Vector2>({ x: 0, y: 0 });
  const [forceCenter, setForceCenter] = useState<{
    ids: string[];
    instant?: boolean;
  }>();
  const [forcedScale, setForcedScale] = useState<{ value: number }>();
  const [forcedOffset, setForcedOffset] = useState<{ value: Vector2 }>();
  const [currentFocusedIds, setCurrentFocusedIds] = useState<string[] | null>(
    null
  );
  const [currentSelectedIds, setCurrentSelectedIds] = useState<string[]>([
    ...selectedIds,
  ]);
  const ref = useRef<HTMLDivElement>(null);
  const nodePositions = useRef<{ [id: string]: Vector2 }>(
    getInitialNodePositions(chart.nodes)
  );
  const nodeSizes = useRef<{ [id: string]: Vector2 }>(
    getInitialNodeSizes(chart.nodes)
  );

  const nodes = useMemo(() => Object.values(chart.nodes), [chart.nodes]);
  const allIds = useMemo(() => Object.keys(chart.nodes), [chart.nodes]);

  const handleDragNodeStart = useCallback(
    ({ id, event }): void => {
      const newSelection = select(
        event,
        () => changeSelection(id, currentSelectedIds),
        () => toggleSelection(id, currentSelectedIds),
        () => multiSelection(id, currentSelectedIds, allIds)
      );
      setCurrentSelectedIds(newSelection);
      if (!draggingIds.includes(id)) {
        onSetDragging([...newSelection]);
      }
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    },
    [draggingIds, currentSelectedIds, allIds, onSetDragging]
  );
  const handleDragNodeEnd = useCallback(
    ({ id, position }) => {
      nodePositions.current = { ...nodePositions.current, [id]: position };
      onSetDragging([]);
      onSetNodePositions({ ...nodePositions.current });
      onSetSelection(currentSelectedIds);
    },
    [currentSelectedIds, onSetDragging, onSetNodePositions, onSetSelection]
  );
  const handleNodeSizeDetermined = useCallback(({ id, size }) => {
    nodeSizes.current[id] = size;
  }, []);
  const handleNodeSizeChanged = useCallback(({ id, size }) => {
    nodeSizes.current[id] = size;
  }, []);
  const handleZoomCanvas = useCallback(
    (input) => {
      onZoomCanvas(input);
    },
    [onZoomCanvas]
  );
  const handleForcedPanCanvas = useCallback(() => {
    setForcedOffset(undefined);
  }, []);
  const handleForcedZoomCanvas = useCallback(() => {
    setForcedScale(undefined);
  }, []);

  const centerNodes = (
    ids: string[],
    positions: { [id: string]: Vector2 },
    sizes: { [id: string]: Vector2 }
  ): void => {
    if (scrollParent) {
      const { centeredOffset, centeredScale } = getCenteredFlowchart(
        scrollParent,
        ids,
        containerChartConfig.canvasConfig.options.minScale,
        containerChartConfig.canvasConfig.options.maxScale,
        positions,
        sizes
      );
      if (centeredOffset) {
        setForcedOffset({ value: centeredOffset });
      }
      if (centeredScale) {
        setForcedScale({ value: centeredScale });
      }
    }
  };

  useEffect(() => {
    if (transitionState === "idle") {
      if (scrollParent && currentSelectedIds.length > 0) {
        const { centeredOffset, centeredScale } = getCenteredFlowchart(
          scrollParent,
          currentSelectedIds,
          containerChartConfig.canvasConfig.options.minScale,
          containerChartConfig.canvasConfig.options.maxScale,
          nodePositions.current,
          nodeSizes.current
        );
        if (centeredOffset) {
          setDefaultOffset(centeredOffset);
        }
        if (centeredScale) {
          setDefaultScale(centeredScale);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollParent, transitionState]);

  useEffect(() => {
    const oldPositionedIds = Object.keys(nodePositions.current);
    const newPositionedIds = Object.keys(chart.nodes);
    const newNodePositions = getInitialNodePositions(
      chart.nodes,
      nodePositions.current
    );
    const newNodeSizes = getInitialNodeSizes(chart.nodes, nodeSizes.current);
    const removeDifference = difference(oldPositionedIds, newPositionedIds);
    if (removeDifference.length > 0) {
      const firstId = removeDifference[0];
      centerNodes([firstId], nodePositions.current, nodeSizes.current);
    }
    const addDifference = difference(newPositionedIds, oldPositionedIds);
    if (addDifference.length > 0) {
      const firstId = addDifference[0];
      centerNodes([firstId], newNodePositions, newNodeSizes);
    }
    nodePositions.current = newNodePositions;
    nodeSizes.current = newNodeSizes;
  }, [chart.nodes, scrollParent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFocusDataIds = debounce(
      (data: { ids: string[]; instant?: boolean }): void => {
        setForceCenter({ ...data });
      },
      200
    );
    events.onFocusData.addListener(onFocusDataIds);
    return (): void => {
      events.onFocusData.removeListener(onFocusDataIds);
    };
  }, [events, allIds, scrollParent]);

  useEffect(() => {
    if (forceCenter) {
      const { ids, instant } = forceCenter;
      if (ids && scrollParent) {
        if (ids.length > 0) {
          const targetIds = allIds.filter((id) => ids.includes(id));
          if (targetIds.length > 0) {
            const { centeredOffset, centeredScale } = getCenteredFlowchart(
              scrollParent,
              targetIds,
              containerChartConfig.canvasConfig.options.minScale,
              containerChartConfig.canvasConfig.options.maxScale,
              nodePositions.current,
              nodeSizes.current
            );
            if (instant) {
              if (centeredOffset) {
                setDefaultOffset(centeredOffset);
              }
              if (centeredScale) {
                setDefaultScale(centeredScale);
              }
            } else {
              if (centeredOffset) {
                setForcedOffset({ value: centeredOffset });
              }
              if (centeredScale) {
                setForcedScale({ value: centeredScale });
              }
            }
          }
        }
      }
    }
    // Stop forcing once pane transition is done.
    setForceCenter(undefined);
  }, [forceCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollParent) {
      window.setTimeout(() => setVisible(true), fadeDelay);
      const { centeredOffset, centeredScale } = getCenteredFlowchart(
        scrollParent,
        [allIds[0]],
        containerChartConfig.canvasConfig.options.minScale,
        containerChartConfig.canvasConfig.options.maxScale,
        nodePositions.current,
        nodeSizes.current
      );
      if (centeredOffset) {
        setDefaultOffset(centeredOffset);
      }
      if (centeredScale) {
        setDefaultScale(centeredScale);
      }
    } else {
      setVisible(false);
    }
  }, [scrollParent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (changeTargetId) {
      setCurrentFocusedIds([changeTargetId]);
    } else {
      setCurrentFocusedIds(null);
    }
  }, [changeTargetId]);

  useEffect(() => {
    if (search === "") {
      onSetSelection([]);
    }
    const newPositionedIds = Object.keys(chart.nodes);
    if (search) {
      const filteredIds = newPositionedIds.filter(
        (id) =>
          infos[id].name.toLowerCase().search(search.toLowerCase()) > -1 ||
          infos[id].summary.toLowerCase().search(search.toLowerCase()) > -1
      );
      onSetSelection(filteredIds);
      setCurrentFocusedIds(filteredIds);
      if (filteredIds.length > 0) {
        centerNodes(filteredIds, nodePositions.current, nodeSizes.current);
      }
    } else {
      setCurrentFocusedIds(null);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentSelectedIds([...selectedIds]);
  }, [selectedIds]);

  return (
    <StyledFlowchart className={StyledFlowchart.displayName} ref={ref}>
      <Flowchart
        chart={chart}
        defaultOffset={defaultOffset}
        defaultScale={defaultScale}
        chartSize={chartSize}
        selectedIds={currentSelectedIds}
        forcedOffset={forcedOffset}
        forcedScale={forcedScale}
        config={containerChartConfig}
        scrollParent={scrollParent}
        ComponentLink={(provided: LinkDefaultProps): JSX.Element => (
          <DataTransition
            type="fade"
            initial={visible ? TransitionState.enter : TransitionState.initial}
            animate={visible ? TransitionState.enter : TransitionState.initial}
          >
            <DataLink {...provided} />
          </DataTransition>
        )}
        chartAreaRef={chartAreaRef}
        onForcedPanCanvas={handleForcedPanCanvas}
        onForcedZoomCanvas={handleForcedZoomCanvas}
        onPanCanvas={onPanCanvas}
        onZoomCanvas={handleZoomCanvas}
        onDragNodeStart={handleDragNodeStart}
        onDragNodeEnd={handleDragNodeEnd}
        onNodeSizeDetermined={handleNodeSizeDetermined}
        onNodeSizeChanged={handleNodeSizeChanged}
      >
        {(provided): JSX.Element => (
          <>
            {nodes.map((node, index) => {
              const value = infos[node.id];
              if (value === undefined) {
                return null;
              }
              return (
                <DataTransition
                  key={node.id}
                  type="fade"
                  transformOrigin={getRectCenter(
                    getRect(
                      nodePositions.current[node.id],
                      nodeSizes.current[node.id]
                    )
                  )}
                  initial={
                    visible ? TransitionState.enter : TransitionState.initial
                  }
                  animate={
                    visible ? TransitionState.enter : TransitionState.initial
                  }
                >
                  <FlowchartNode
                    {...provided}
                    id={node.id}
                    defaultPosition={node.defaultPosition}
                  >
                    {children &&
                      children({
                        id: node.id,
                        index,
                        value,
                        currentOrderedIds: allIds,
                        currentDraggingIds: draggingIds,
                        currentSelectedIds,
                        currentFocusedIds,
                      })}
                  </FlowchartNode>
                </DataTransition>
              );
            })}
          </>
        )}
      </Flowchart>
    </StyledFlowchart>
  );
};

export default DataChart;
