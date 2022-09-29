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
