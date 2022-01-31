import { Vector2 } from "../../../impower-core";
import {
  BlockData,
  ContainerData,
  isPositionable,
} from "../../../impower-game/data";
import { ImpowerGameInspector } from "../../../impower-game/inspector";
import { Chart, Link, Node } from "../../../impower-react-flowchart";
import { layout, styledTheme } from "../../../impower-route";

export const chartMinScale = 0.26;
export const chartMaxScale = 1;
export const chartSize = {
  x: 3200,
  y: 3200,
};
export const chartGridSize = 16;
export const chartPinchStep = 1.2;
export const chartWheelStep = 1.2;
export const chartPortDistance = 16;

export const containerChartConfig = {
  canvasConfig: {
    options: {
      gridSize: chartGridSize,
      gridColor: styledTheme.colors.grid,
      minScale: chartMinScale,
      maxScale: chartMaxScale,
    },
    pinch: {
      step: chartPinchStep,
    },
    wheel: {
      step: chartWheelStep,
    },
  },
  linkConfig: {
    linkColor: styledTheme.colors.nodeLink,
    minCurve: 8,
  },
  portConfig: {
    sideOffsets: {
      Top: styledTheme.space.reorderableTop * 8,
      Bottom: styledTheme.space.reorderableBottom * 8,
      Left: 32,
      Right: layout.size.minWidth.headerIcon - 1,
    },
    portOffsets: {
      Input: -8,
      Output: 8,
    },
  },
};

const getContainerNodeTargetIds = (
  inspector: ImpowerGameInspector,
  containerData: ContainerData
): string[] => {
  // Check if any of the commands target other blocks.
  const blockData = containerData as BlockData;
  if (blockData && blockData.commands && blockData.commands.order.length > 0) {
    return blockData.commands.order.flatMap((id) =>
      inspector.getContainerTargetIds(blockData.commands.data[id])
    );
  }
  return [];
};

const getContainerNode = (
  id: string,
  nodePositions: { [id: string]: Vector2 }
): Node => {
  return {
    id,
    defaultPosition: nodePositions[id],
  };
};

const getContainerNodes = (
  ids: string[],
  nodePositions: { [id: string]: Vector2 }
): { [id: string]: Node } => {
  const nodes: { [id: string]: Node } = {};
  ids.forEach((id) => {
    nodes[id] = getContainerNode(id, nodePositions);
  });
  return nodes;
};

const getLinkId = (fromNodeId: string, toNodeId: string): string => {
  return `${fromNodeId}-${toNodeId}`;
};

const getLink = (fromNodeId: string, toNodeId: string): Link => {
  return {
    id: getLinkId(fromNodeId, toNodeId),
    fromNodeId,
    toNodeId,
  };
};

const getContainerLinks = (
  inspector: ImpowerGameInspector,
  containers: {
    [refId: string]: ContainerData;
  }
): { [refId: string]: Link } => {
  const links: { [refId: string]: Link } = {};
  Object.values(containers).forEach((container) => {
    getContainerNodeTargetIds(inspector, container).forEach(
      (targetContainerId) => {
        if (containers[targetContainerId]) {
          links[getLinkId(container.reference.refId, targetContainerId)] =
            getLink(container.reference.refId, targetContainerId);
        }
      }
    );
  });
  return links;
};

export const getContainerChart = (
  inspector: ImpowerGameInspector,
  containers: {
    [refId: string]: ContainerData;
  }
): Chart => {
  const nodePositions: { [refId: string]: Vector2 } = {};
  Object.values(containers).forEach((container) => {
    if (isPositionable(container)) {
      nodePositions[container.reference.refId] = container.nodePosition;
    }
  });
  const chart: Chart = {
    nodes: getContainerNodes(
      Object.values(containers).map((container) => container.reference.refId),
      nodePositions
    ),
    links: getContainerLinks(inspector, containers),
  };

  return chart;
};
