import { Port, Side } from "./generics";

export interface FlowChartConfig {
  canvasConfig?: CanvasConfig;
  linkConfig?: LinkConfig;
  portConfig?: PortConfig;
}

export interface CanvasConfig {
  options?: {
    gridSize?: number;
    gridColor?: string;
    minScale?: number;
    maxScale?: number;
  };
  pan?: {
    disabled?: boolean;
  };
  wheel?: {
    disabled?: boolean;
    step?: number;
  };
  pinch?: {
    disabled?: boolean;
    step?: number;
  };
}

export interface LinkConfig {
  linkColor?: string;
  lineStrokeWidth?: number;
  arrowSize?: number;
  arrowStrokeWidth?: number;
  minCurve: number;
}

export interface PortConfig {
  sideOffsets?: { [side in Side]: number };
  portOffsets?: { [port in Port]: number };
}

export const defaultFlowchartConfig = {
  canvasConfig: {
    options: {
      gridSize: 16,
      gridColor: "#FFFFFF40",
      minScale: 0.5,
      maxScale: 1,
    },
    pan: {
      disabled: false,
    },
    wheel: {
      disabled: false,
      step: 1.2,
    },
    pinch: {
      disabled: false,
      step: 1,
    },
  },
  linkConfig: {
    linkColor: "cornflowerblue",
    lineStrokeWidth: 2,
    arrowSize: 8,
    arrowStrokeWidth: 2,
    minCurve: 8,
  },
  portConfig: {
    sideOffsets: { Top: 0, Bottom: 0, Left: 0, Right: 0 },
    portOffsets: { Input: -8, Output: 8 },
  },
};
