import { Vector2, Rect } from "../types/generics";
import { clamp } from "./clamp";

export const getRectSize = (rect: Rect): Vector2 => {
  return { x: rect.max.x - rect.min.x, y: rect.max.y - rect.min.y };
};

export const getRectCenter = (rect: Rect): Vector2 => {
  return {
    x: rect.min.x + (rect.max.x - rect.min.x) * 0.5,
    y: rect.min.y + (rect.max.y - rect.min.y) * 0.5,
  };
};

export const getRect = (position: Vector2, size: Vector2): Rect => {
  const safePosition = position || { x: 0, y: 0 };
  const safeSize = size || { x: 0, y: 0 };
  return {
    min: safePosition,
    max: { x: safePosition.x + safeSize.x, y: safePosition.y + safeSize.y },
  };
};

export const getRects = (
  ids: string[],
  allPositions: { [id: string]: Vector2 },
  allSizes: { [id: string]: Vector2 }
): Rect[] => {
  const rects: Rect[] = [];
  ids.forEach((id) => {
    const position = allPositions[id];
    const size = allSizes[id];
    if (position) {
      rects.push(getRect(position, size));
    }
  });

  return rects;
};

export const getEncompassingRect = (rects: Rect[]): Rect | undefined => {
  if (rects.length === 0) {
    return undefined;
  }

  const firstRect = rects[0];
  const { min, max } = firstRect;

  let minX = min.x;
  let minY = min.y;
  let maxX = max.x;
  let maxY = max.y;

  rects.forEach((rect) => {
    minX = Math.min(minX, rect.min.x);
    minY = Math.min(minY, rect.min.y);
    maxX = Math.max(maxX, rect.max.x);
    maxY = Math.max(maxY, rect.max.y);
  });

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
};

export const getCenteredRectScale = (
  rect: Rect,
  scrollAreaSize: Vector2,
  minScale: number,
  maxScale: number
): number => {
  const preferredZoomLevel = Math.min(
    scrollAreaSize.x / getRectSize(rect).x,
    scrollAreaSize.y / getRectSize(rect).y
  );
  return clamp(preferredZoomLevel, minScale, maxScale);
};

export const getCenteredRectOffset = (
  rect: Rect,
  scrollAreaSize: Vector2,
  scale: number
): Vector2 => {
  const centerPos = getRectCenter(rect);
  const x = centerPos.x * scale - scrollAreaSize.x * 0.5;
  const y = centerPos.y * scale - scrollAreaSize.y * 0.5;
  return { x, y };
};

export const getFocusedOffset = (
  focusScrollPosition: Vector2,
  focusChartPosition: Vector2,
  scale: number
): Vector2 => {
  const x = focusChartPosition.x * scale - focusScrollPosition.x;
  const y = focusChartPosition.y * scale - focusScrollPosition.y;
  return { x, y };
};

export const getFocusedPosition = (
  scrollPosition: Vector2,
  chartPosition: Vector2,
  scale: number,
  focusClientPosition: Vector2
): { focusChartPosition: Vector2; focusScrollPosition: Vector2 } => {
  const viewPosOffset = {
    x: scrollPosition.x - chartPosition.x,
    y: scrollPosition.y - chartPosition.y,
  };
  const focusScrollPosition = {
    x: focusClientPosition.x - scrollPosition.x,
    y: focusClientPosition.y - scrollPosition.y,
  };
  const focusChartX = (viewPosOffset.x + focusScrollPosition.x) / scale;
  const focusChartY = (viewPosOffset.y + focusScrollPosition.y) / scale;
  const focusChartPosition = { x: focusChartX, y: focusChartY };
  return { focusChartPosition, focusScrollPosition };
};
