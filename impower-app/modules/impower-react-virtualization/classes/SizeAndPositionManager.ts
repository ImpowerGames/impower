import { Alignment, ItemSize } from "../types/constants";
import { SizeAndPositionManagerType } from "../types/SizeAndPositionManagerType";

export interface Options {
  itemCount?: number;
  itemSize: ItemSize;
  estimatedItemSize: number;
}

export default class SizeAndPositionManager
  implements SizeAndPositionManagerType
{
  private itemCount: number;

  private estimatedItemSize: number;

  private itemSize: ItemSize;

  private lastMeasuredIndex: number;

  private measuredItemSizes: number[];

  private measuredItemInsets: number[];

  constructor({ itemCount, estimatedItemSize, itemSize }: Options) {
    this.itemCount = itemCount || 0;
    this.estimatedItemSize = estimatedItemSize || 50;
    this.itemSize = itemSize;

    // Cache of size and position data for items, mapped by item index.
    this.measuredItemSizes = [];
    this.measuredItemInsets = [];

    this.lastMeasuredIndex = -1;
  }

  getItemSize(index: number): number {
    if (typeof this.itemSize === "number") {
      return this.itemSize;
    }
    if (Array.isArray(this.itemSize)) {
      return this.itemSize[index];
    }
    if (typeof this.itemSize === "function") {
      return this.itemSize(index);
    }
    return undefined;
  }

  updateConfig({
    itemCount,
    estimatedItemSize,
  }: {
    itemCount?: number;
    estimatedItemSize?: number;
  }): void {
    if (itemCount) {
      this.itemCount = itemCount;
    }
    if (estimatedItemSize) {
      this.estimatedItemSize = estimatedItemSize;
    }
  }

  getLastMeasuredIndex(): number {
    return this.lastMeasuredIndex;
  }

  /**
   * This method returns the size and position for the item at the specified index.
   * It just-in-time calculates (or used cached values) for items leading up to the index.
   */
  getSizeAndPositionForIndex(index: number): { inset: number; size: number } {
    if (index < 0) {
      return { inset: 0, size: 0 };
    }

    if (index > this.lastMeasuredIndex) {
      const lastMeasuredSizeAndPosition =
        this.getSizeAndPositionOfLastMeasuredItem();
      let inset =
        lastMeasuredSizeAndPosition.inset + lastMeasuredSizeAndPosition.size;

      for (let i = this.lastMeasuredIndex + 1; i <= index; i += 1) {
        const size = this.getItemSize(i);

        if (size == null || Number.isNaN(size)) {
          throw Error(
            `Invalid size returned for index ${i}: ${JSON.stringify(
              this.itemSize
            )}`
          );
        }

        this.measuredItemInsets[i] = inset;
        this.measuredItemSizes[i] = size;

        inset += size;
      }

      this.lastMeasuredIndex = index;
    }
    const size = this.measuredItemSizes[index];
    const inset = this.measuredItemInsets[index];

    if (index >= this.itemCount) {
      return { inset: inset + size, size: 0 };
    }

    return { inset, size };
  }

  getEstimatedSizeAndPositionForIndex(index: number): {
    inset: number;
    size: number;
  } {
    if (index < 0) {
      return { inset: 0, size: 0 };
    }

    const lastMeasuredSizeAndPosition =
      this.getSizeAndPositionOfLastMeasuredItem();
    let inset =
      lastMeasuredSizeAndPosition.inset + lastMeasuredSizeAndPosition.size;
    let size = 0;

    for (let i = this.lastMeasuredIndex + 1; i <= index; i += 1) {
      size = this.estimatedItemSize;
      inset += size;
    }

    if (index >= this.itemCount) {
      return { inset: inset + size, size: 0 };
    }

    return { inset, size };
  }

  getSizeAndPositionOfLastMeasuredItem(): { inset: number; size: number } {
    if (this.lastMeasuredIndex < 0) {
      return { inset: 0, size: 0 };
    }
    return {
      inset: this.measuredItemInsets[this.lastMeasuredIndex] || 0,
      size: this.measuredItemSizes[this.lastMeasuredIndex] || 0,
    };
  }

  /**
   * Total size of all items being measured.
   * This value will be completedly estimated initially.
   * As items as measured the estimate will be updated.
   */
  getTotalSize(): number {
    if (typeof this.itemSize === "number") {
      return this.itemCount * this.itemSize;
    }
    const lastMeasuredSizeAndPosition =
      this.getSizeAndPositionOfLastMeasuredItem();
    return (
      lastMeasuredSizeAndPosition.inset +
      lastMeasuredSizeAndPosition.size +
      (this.itemCount - this.lastMeasuredIndex - 1) * this.estimatedItemSize
    );
  }

  /**
   * Determines a new inset that ensures a certain item is visible, given the alignment.
   *
   * @param align Desired alignment within container; one of "start" (default), "center", or "end"
   * @param containerSize Size (width or height) of the container viewport
   * @param scrollPosition The current scrollPosition of the scroll view
   * @param targetIndex The index of the item you want to be visible
   * @return Offset to use to ensure the specified item is visible
   */
  getScrollPositionForIndex({
    align = Alignment.Start,
    containerSize,
    scrollPosition,
    targetIndex,
    rootOffset,
  }: {
    align: Alignment | undefined;
    containerSize: number;
    scrollPosition: number;
    targetIndex: number;
    rootOffset: number;
  }): number {
    if (containerSize <= 0) {
      return 0;
    }

    const datum =
      targetIndex <= this.lastMeasuredIndex
        ? this.getSizeAndPositionForIndex(targetIndex)
        : this.getEstimatedSizeAndPositionForIndex(targetIndex);
    const maxOffset = rootOffset + datum.inset;
    const minOffset = maxOffset - containerSize + datum.size;

    let idealOffset;

    switch (align) {
      case Alignment.End:
        idealOffset = minOffset;
        break;
      case Alignment.Center:
        idealOffset = maxOffset - (containerSize - datum.size) / 2;
        break;
      case Alignment.Start:
        idealOffset = maxOffset;
        break;
      default:
        idealOffset = Math.max(minOffset, Math.min(maxOffset, scrollPosition));
    }

    return idealOffset;
  }

  getVisibleRange({
    containerSize,
    scrollPosition,
    overscanCount,
    rootOffset,
  }: {
    containerSize: number;
    scrollPosition: number;
    overscanCount: number;
    rootOffset: number;
  }): { startIndex?: number; endIndex?: number } {
    const validOverscanCount = Math.floor(overscanCount);
    let newOffset = scrollPosition - rootOffset;
    const totalSize = this.getTotalSize();

    if (totalSize === 0) {
      return {};
    }

    const maxOffset = newOffset + containerSize;
    let startIndex = this.findNearestItem(newOffset);

    if (typeof startIndex === "undefined") {
      throw Error(`Invalid offset ${newOffset} specified`);
    }

    const datum =
      startIndex <= this.lastMeasuredIndex
        ? this.getSizeAndPositionForIndex(startIndex)
        : this.getEstimatedSizeAndPositionForIndex(startIndex);
    newOffset = datum.inset + datum.size;

    let endIndex = startIndex;

    while (newOffset < maxOffset && endIndex < this.itemCount - 1) {
      endIndex += 1;
      newOffset +=
        endIndex <= this.lastMeasuredIndex
          ? this.getSizeAndPositionForIndex(endIndex).size
          : this.getEstimatedSizeAndPositionForIndex(endIndex).size;
    }

    if (validOverscanCount) {
      startIndex = Math.max(0, startIndex - validOverscanCount);
      endIndex = Math.min(endIndex + validOverscanCount, this.itemCount - 1);
    }

    return {
      startIndex,
      endIndex,
    };
  }

  isReadyForPositioning(): boolean {
    for (let i = 0; i < this.itemCount; i += 1) {
      if (this.measuredItemSizes[i] === undefined) {
        return false;
      }
    }
    return true;
  }

  /**
   * Clear all cached values for items after the specified index.
   * This method should be called for any item that has changed its size.
   * It will not immediately perform any calculations; they'll be performed the next time getSizeAndPositionForIndex() is called.
   */
  updateItemSize(index: number, size: number): void {
    this.measuredItemSizes[index] = size;
    this.lastMeasuredIndex = Math.min(this.lastMeasuredIndex, index);
  }

  calculatePositions(): void {
    let inset = 0;
    for (let i = 0; i < this.itemCount; i += 1) {
      const size = this.measuredItemSizes[i];
      if (size === undefined) {
        return;
      }
      this.measuredItemInsets[i] = inset;
      this.lastMeasuredIndex = i;
      inset += size;
    }
  }

  resetItemSizes(): void {
    this.lastMeasuredIndex = -1;
    this.measuredItemSizes = [];
    this.measuredItemInsets = [];
  }

  /**
   * Searches for the item (index) nearest the specified inset.
   *
   * If no exact match is found the next lowest item index will be returned.
   * This allows partially visible items (with insets just before/above the fold) to be visible.
   */
  findNearestItem(inset: number): number {
    let newInset = inset;

    if (Number.isNaN(newInset)) {
      throw Error(`Invalid inset ${newInset} specified`);
    }

    // Our search algorithms find the nearest match at or below the specified inset.
    // So make sure the inset is at least 0 or no match will be found.
    newInset = Math.max(0, newInset);

    const lastMeasuredSizeAndPosition =
      this.getSizeAndPositionOfLastMeasuredItem();
    const lastMeasuredIndex = Math.max(0, this.lastMeasuredIndex);

    if (lastMeasuredSizeAndPosition.inset >= newInset) {
      // If we've already measured items within this range just use a binary search as it's faster.
      return this.binarySearch({
        high: lastMeasuredIndex,
        low: 0,
        inset: newInset,
      });
    }
    // If we haven't yet measured this high, fallback to an exponential search with an inner binary search.
    // The exponential search avoids pre-computing sizes for the full set of items as a binary search would.
    // The overall complexity for this approach is O(log n).
    return this.exponentialSearch({
      index: lastMeasuredIndex,
      inset: newInset,
    });
  }

  private binarySearch({
    low,
    high,
    inset,
  }: {
    low: number;
    high: number;
    inset: number;
  }): number {
    let newLow = low;
    let newHigh = high;
    let middle = 0;
    let currentInset = 0;

    while (newLow <= newHigh) {
      middle = newLow + Math.floor((newHigh - newLow) / 2);
      currentInset =
        middle <= this.lastMeasuredIndex
          ? this.getSizeAndPositionForIndex(middle).inset
          : this.getEstimatedSizeAndPositionForIndex(middle).inset;

      if (currentInset === inset) {
        return middle;
      }
      if (currentInset < inset) {
        newLow = middle + 1;
      } else if (currentInset > inset) {
        newHigh = middle - 1;
      }
    }

    if (newLow > 0) {
      return newLow - 1;
    }

    return 0;
  }

  private exponentialSearch({
    index,
    inset,
  }: {
    index: number;
    inset: number;
  }): number {
    let newIndex = index;
    let interval = 1;

    while (
      newIndex < this.itemCount &&
      (newIndex <= this.lastMeasuredIndex
        ? this.getSizeAndPositionForIndex(newIndex).inset
        : this.getEstimatedSizeAndPositionForIndex(newIndex).inset) < inset
    ) {
      newIndex += interval;
      interval *= 2;
    }

    return this.binarySearch({
      high: Math.min(index, this.itemCount - 1),
      low: Math.floor(index / 2),
      inset,
    });
  }
}
