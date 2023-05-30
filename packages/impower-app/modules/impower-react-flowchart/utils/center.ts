import { Vector2 } from "../types/generics";
import {
  getCenteredRectOffset,
  getCenteredRectScale,
  getEncompassingRect,
  getFocusedPosition,
  getRects,
} from "./rect";

export const getCenteredFlowchart = (
  scrollAreaElement: HTMLElement,
  ids: string[],
  minScale: number,
  maxScale: number,
  nodePositions: { [id: string]: Vector2 },
  nodeSizes: { [id: string]: Vector2 }
): { centeredOffset?: Vector2; centeredScale?: number } => {
  const scrollAreaSize = {
    x: scrollAreaElement.clientWidth,
    y: scrollAreaElement.clientHeight,
  };
  const nodeRects = getRects(ids, nodePositions, nodeSizes);
  const nodesRect = getEncompassingRect(nodeRects);
  if (nodesRect) {
    const centeredScale = getCenteredRectScale(
      nodesRect,
      scrollAreaSize,
      minScale,
      maxScale
    );
    const centeredOffset = getCenteredRectOffset(
      nodesRect,
      scrollAreaSize,
      centeredScale
    );
    return { centeredOffset, centeredScale };
  }
  return { centeredOffset: undefined, centeredScale: undefined };
};

export const getCenteredPosition = (
  scrollAreaElement: HTMLElement,
  chartAreaElement: HTMLElement,
  scale: number
): { centeredChartPosition: Vector2; centeredScrollPosition: Vector2 } => {
  const scrollPosition = scrollAreaElement.getBoundingClientRect();
  const chartPosition = chartAreaElement.getBoundingClientRect();
  const focusClientPosition = {
    x: scrollPosition.x + scrollAreaElement.clientWidth * 0.5,
    y: scrollPosition.y + scrollAreaElement.clientHeight * 0.5,
  };
  const focusedPosition = getFocusedPosition(
    scrollPosition,
    chartPosition,
    scale,
    focusClientPosition
  );
  return {
    centeredChartPosition: focusedPosition.focusChartPosition,
    centeredScrollPosition: focusedPosition.focusScrollPosition,
  };
};
