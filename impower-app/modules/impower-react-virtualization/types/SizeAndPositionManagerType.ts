import { Alignment } from "./constants";

export interface SizeAndPositionManagerType {
  getItemSize: (index: number) => number;
  updateConfig: ({
    itemCount,
    estimatedItemSize,
  }: {
    itemCount?: number;
    estimatedItemSize?: number;
  }) => void;
  getLastMeasuredIndex: () => number;
  getSizeAndPositionForIndex: (index: number) => {
    inset: number;
    size: number;
  };
  getEstimatedSizeAndPositionForIndex: (index: number) => {
    inset: number;
    size: number;
  };
  getSizeAndPositionOfLastMeasuredItem: () => { inset: number; size: number };
  getTotalSize: () => number;
  getScrollPositionForIndex: (params: {
    align: Alignment | undefined;
    containerSize: number;
    scrollPosition: number;
    targetIndex: number;
    rootOffset: number;
  }) => number;
  getVisibleRange: ({
    containerSize,
    scrollPosition,
    overscanCount,
    rootOffset,
  }: {
    containerSize: number;
    scrollPosition: number;
    overscanCount: number;
    rootOffset: number;
  }) => { startIndex?: number; endIndex?: number };
  isReadyForPositioning: () => boolean;
  updateItemSize: (index: number, size: number) => void;
  calculatePositions: () => void;
  resetItemSizes: () => void;
  findNearestItem: (inset: number) => number;
}
