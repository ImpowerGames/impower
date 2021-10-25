import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alignment,
  Direction,
  insetProp,
  ItemSize,
  ScrollChangeReason,
  sizeProp,
  transformProp,
} from "../types/constants";
import { SizeAndPositionManagerType } from "../types/SizeAndPositionManagerType";
import { findScrollParent } from "../utils/findScrollParent";
import { getContainerSize } from "../utils/getContainerSize";
import { getOffset } from "../utils/getOffset";
import { getScrollPosition } from "../utils/getScrollPosition";
import { setScrollPosition } from "../utils/setScrollPosition";

export const debounce = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): ((...args: any[]) => void) => {
  let timeout = 0;
  return (...args: Parameters<T>): void => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      callback(...args);
    }, delay);
  };
};

const getEstimatedItemSize = (
  estimatedItemSize: number,
  itemSize: ItemSize
): number => {
  return (typeof itemSize === "number" ? itemSize : 0) || estimatedItemSize;
};

const requestWidth = (
  onMeasure: (size: number) => void,
  instance: HTMLElement,
  sizeAndPositionManager: SizeAndPositionManagerType
): number => {
  const loop = (): void => {
    const size =
      instance.clientWidth || instance?.getBoundingClientRect().width;
    if (size && sizeAndPositionManager) {
      onMeasure(size);
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

const requestHeight = (
  onMeasure: (size: number) => void,
  instance: HTMLElement,
  sizeAndPositionManager: SizeAndPositionManagerType
): number => {
  const loop = (): void => {
    const size =
      instance.clientHeight || instance?.getBoundingClientRect().height;
    if (size && sizeAndPositionManager) {
      onMeasure(size);
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

interface ItemStyle {
  position?: "absolute";
  top?: number;
  left?: number;
  width?: string | number;
  height?: string | number;
  minWidth?: number;
  minHeight?: number;
}

interface ProvidedProps {
  index: number;
  style: ItemStyle;
  measureRef: (ref: Element) => void;
}

export interface VirtualizedListContentProps {
  sizeAndPositionManager: SizeAndPositionManagerType;
  itemCount: number;
  itemSize?: ItemSize;
  estimatedItemSize?: number;
  overscanCount?: number;
  scrollToIndex?: { index: number; transition: string };
  scrollDirection?: Direction;
  scrollToAlignment?: Alignment;
  style?: React.CSSProperties;
  overlay?: React.ReactNode;
  scrollParent?: HTMLElement | null;
  onScroll?(
    e: Event,
    scrollParent: HTMLElement,
    rootElement: HTMLElement,
    scrollPosition: number,
    reason: ScrollChangeReason
  ): void;
  onScrollToIndex?: () => void;
  onScrolledToEnd?: () => void;
  onRef?: (instance: HTMLDivElement | null) => void;
  onStartIndexChanged?: (index: number) => void;
  onEndIndexChanged?: (index: number) => void;
  onRenderItem?: (index: number) => void;
  children: (props: ProvidedProps) => React.ReactNode;
}

export const VirtualizedListContent = React.memo(
  (props: VirtualizedListContentProps): JSX.Element => {
    const {
      sizeAndPositionManager,
      itemCount,
      itemSize,
      estimatedItemSize,
      overscanCount = 1,
      scrollToIndex,
      scrollDirection = Direction.Vertical,
      scrollToAlignment = Alignment.Center,
      style,
      overlay,
      scrollParent,
      onScroll,
      onScrollToIndex,
      onScrolledToEnd,
      onRef,
      onStartIndexChanged,
      onEndIndexChanged,
      onRenderItem,
      children,
    } = props;

    const [rootElement, setRootElement] = useState<HTMLDivElement>();
    const [currentScrollPosition, setCurrentScrollPosition] =
      useState<number>(0);
    const [currentScrollParent, setCurrentScrollParent] =
      useState<HTMLElement>(scrollParent);
    const [, forceUpdate] = useState({});

    const measureElements = useRef<HTMLElement[]>([]);
    const scrollReason = useRef<ScrollChangeReason>(
      ScrollChangeReason.Observed
    );
    const cachedStyles = useRef<ItemStyle[]>([]);
    const forcedStartIndex = useRef<number>();
    const forcedEndIndex = useRef<number>();

    useEffect(() => {
      if (scrollParent) {
        setCurrentScrollParent(scrollParent);
      }
    }, [scrollParent]);

    useEffect(() => {
      if (sizeAndPositionManager) {
        sizeAndPositionManager.updateConfig({ itemCount, estimatedItemSize });
        forceUpdate({});
      }
    }, [estimatedItemSize, itemCount, sizeAndPositionManager]);

    const getItemStyle = useCallback(
      (index: number, scrollDirection: Direction): ItemStyle => {
        const cachedStyle = cachedStyles.current[index];
        if (cachedStyle) {
          return cachedStyle;
        }
        let style: ItemStyle = {};
        if (scrollDirection === Direction.Vertical) {
          style.width = "100%";
        }
        if (scrollDirection === Direction.Horizontal) {
          style.height = "100%";
        }
        if (itemSize !== undefined) {
          const size =
            typeof itemSize === "number" ? itemSize : itemSize[index];
          if (scrollDirection === Direction.Vertical) {
            style.height = size;
          }
          if (scrollDirection === Direction.Horizontal) {
            style.width = size;
          }
        }
        if (!sizeAndPositionManager) {
          return style;
        }
        if (
          itemSize !== undefined ||
          index <= sizeAndPositionManager?.getLastMeasuredIndex()
        ) {
          const sizeAndPosition =
            sizeAndPositionManager?.getSizeAndPositionForIndex(index);
          const sizeAndPositionStyle = sizeAndPosition
            ? {
                [sizeProp[scrollDirection]]: sizeAndPosition?.size,
                [insetProp[scrollDirection]]: sizeAndPosition?.inset,
              }
            : {};
          if (sizeAndPosition) {
            style.position = "absolute";
            style = {
              ...style,
              ...sizeAndPositionStyle,
            };
            cachedStyles.current[index] = style;
          }
        }
        return style;
      },
      [itemSize, sizeAndPositionManager]
    );

    const handleInitialLayout = useCallback(() => {
      for (let i = 0; i < itemCount; i += 1) {
        const el = measureElements.current[i];
        cachedStyles.current[i] = undefined;
        const style = getItemStyle(i, scrollDirection);
        if (el?.parentElement) {
          if (scrollDirection === Direction.Vertical) {
            if (style.top !== undefined) {
              el.parentElement.style.top = `${style.top}px`;
            }
            if (style.height !== undefined) {
              el.parentElement.style.height = `${style.height}px`;
            }
            if (style.minHeight !== undefined) {
              el.parentElement.style.minHeight = `${style.minHeight}px`;
            }
            el.parentElement.style.width = `100%`;
          }
          if (scrollDirection === Direction.Horizontal) {
            if (style.top !== undefined) {
              el.parentElement.style.left = `${style.left}px`;
            }
            if (style.height !== undefined) {
              el.parentElement.style.width = `${style.width}px`;
            }
            if (style.minHeight !== undefined) {
              el.parentElement.style.minWidth = `${style.minWidth}px`;
            }
            el.parentElement.style.height = `100%`;
          }
          el.parentElement.style.position = style.position;
        }
      }
    }, [getItemStyle, itemCount, scrollDirection]);

    const rootOffset = useMemo(
      () => getOffset(rootElement, currentScrollParent, scrollDirection),
      [rootElement, currentScrollParent, scrollDirection]
    );

    const visibleRange = sizeAndPositionManager?.getVisibleRange({
      containerSize: getContainerSize(currentScrollParent, scrollDirection),
      scrollPosition: currentScrollPosition,
      overscanCount,
      rootOffset,
    });

    const loadEndIndex =
      itemSize === undefined && measureElements.current.length < itemCount - 1
        ? itemCount - 1
        : undefined;
    const currentForcedStartIndex = forcedStartIndex.current;
    const currentForcedEndIndex = forcedEndIndex.current;

    const items = [];
    const currentStartIndex =
      currentForcedStartIndex !== undefined
        ? currentForcedStartIndex
        : visibleRange?.startIndex !== undefined
        ? visibleRange?.startIndex
        : 0;
    const currentEndIndex =
      loadEndIndex !== undefined
        ? loadEndIndex
        : currentForcedEndIndex !== undefined
        ? currentForcedEndIndex
        : visibleRange?.endIndex !== undefined
        ? visibleRange?.endIndex
        : itemCount;
    for (let index = currentStartIndex; index <= currentEndIndex; index += 1) {
      const style = getItemStyle(index, scrollDirection);
      const currentIndex = index;
      items.push(
        children({
          index,
          style,
          measureRef: (instance: HTMLElement) => {
            if (instance) {
              measureElements.current[currentIndex] = instance;
              const onMeasure = (size: number): void => {
                if (instance && sizeAndPositionManager) {
                  sizeAndPositionManager.updateItemSize(index, size);
                  if (sizeAndPositionManager.isReadyForPositioning()) {
                    sizeAndPositionManager.calculatePositions();
                    handleInitialLayout();
                  }
                }
              };
              if (scrollDirection === Direction.Vertical) {
                requestHeight(onMeasure, instance, sizeAndPositionManager);
              } else {
                requestWidth(onMeasure, instance, sizeAndPositionManager);
              }
            }
          },
        })
      );
      if (onRenderItem) {
        onRenderItem(index);
      }
    }
    if (
      currentForcedStartIndex !== undefined ||
      currentForcedEndIndex !== undefined
    ) {
      forcedStartIndex.current = undefined;
      forcedEndIndex.current = undefined;
    }

    const handleRef = useCallback(
      (instance: HTMLDivElement | null): void => {
        if (instance) {
          setRootElement(instance);
          if (onRef) {
            onRef(instance);
          }
        }
      },
      [onRef]
    );

    useEffect(() => {
      const newScrollParent = findScrollParent(rootElement, scrollDirection);
      setCurrentScrollParent(newScrollParent);
    }, [rootElement, scrollDirection, sizeAndPositionManager]);

    const scrollTo = useCallback(
      (value: number, transition: string): void => {
        if (!currentScrollParent || !rootElement) {
          return;
        }
        // We use the FLIP technique to animate the scroll change.
        // See https://aerotwist.com/blog/flip-your-animations/ for more info.

        // Get the element's rect which will be used to determine how far the list
        // has scrolled once the scroll position has been set
        const preScrollRect = rootElement?.getBoundingClientRect();

        // Scroll to the right position
        setScrollPosition(currentScrollParent, scrollDirection, value);

        // Return early and perform no animation if forced, or no transition has
        // been passed
        if (!transition || rootElement.style.transition !== "") {
          return;
        }

        // The rect of the element after being scrolled lets us calculate the
        // distance it has travelled
        const postScrollRect = rootElement?.getBoundingClientRect();

        const delta =
          preScrollRect[insetProp[scrollDirection]] -
          postScrollRect[insetProp[scrollDirection]];

        // Set `translateX` or `translateY` (depending on the scroll direction) in
        // order to move the element back to the original position before scrolling
        rootElement.style.transform = `${transformProp[scrollDirection]}(${delta}px)`;

        // Wait for the next frame, then add a transition to the element and move it
        // back to its current position. This makes the browser animate the
        // transform as if the element moved from its location pre-scroll to its
        // final location.
        requestAnimationFrame(() => {
          if (rootElement) {
            rootElement.style.transition = transition || "";
            rootElement.style.transitionProperty = "transform";

            rootElement.style.transform = "";
          }
        });

        // We listen to the end of the transition in order to perform some cleanup
        const reset = (): void => {
          if (rootElement) {
            rootElement.style.transition = "";
            rootElement.style.transitionProperty = "";

            rootElement.removeEventListener("transitionend", reset);

            scrollReason.current = ScrollChangeReason.Observed;
            if (onScrollToIndex) {
              onScrollToIndex();
            }
          }
        };

        rootElement.addEventListener("transitionend", reset);
      },
      [rootElement, onScrollToIndex, scrollDirection, currentScrollParent]
    );

    useEffect(() => {
      const scrollPosition = getScrollPosition(
        currentScrollParent,
        scrollDirection
      );
      setCurrentScrollPosition(scrollPosition);
    }, [currentScrollParent, scrollDirection]);

    const handleScroll = useCallback(
      (e: Event): void => {
        const scrollPosition = getScrollPosition(
          currentScrollParent,
          scrollDirection
        );
        setCurrentScrollPosition(scrollPosition);
        if (sizeAndPositionManager) {
          const endScrollPosition =
            sizeAndPositionManager.getScrollPositionForIndex({
              rootOffset,
              containerSize: getContainerSize(
                currentScrollParent,
                scrollDirection
              ),
              targetIndex: itemCount - 1,
              scrollPosition: getScrollPosition(
                currentScrollParent,
                scrollDirection
              ),
              align: Alignment.End,
            });
          if (scrollPosition >= endScrollPosition) {
            if (onScrolledToEnd) {
              onScrolledToEnd();
            }
          }
        }
        if (onScroll) {
          onScroll(
            e,
            currentScrollParent,
            rootElement,
            scrollPosition,
            scrollReason.current
          );
        }
      },
      [
        currentScrollParent,
        scrollDirection,
        sizeAndPositionManager,
        rootOffset,
        itemCount,
        onScroll,
        onScrolledToEnd,
        rootElement,
      ]
    );

    useEffect(() => {
      if (scrollToIndex) {
        scrollReason.current = ScrollChangeReason.Requested;
        if (scrollToIndex.index < 0) {
          scrollTo(0, scrollToIndex.transition);
        } else if (scrollToIndex.index >= itemCount) {
          scrollTo(Number.MAX_SAFE_INTEGER, scrollToIndex.transition);
        } else {
          const targetIndex =
            scrollToIndex.index < 0
              ? 0
              : scrollToIndex.index >= itemCount
              ? itemCount - 1
              : scrollToIndex.index;
          const position = sizeAndPositionManager.getScrollPositionForIndex({
            rootOffset,
            containerSize: getContainerSize(
              currentScrollParent,
              scrollDirection
            ),
            targetIndex,
            scrollPosition: getScrollPosition(
              currentScrollParent,
              scrollDirection
            ),
            align: scrollToAlignment,
          });
          scrollTo(position, scrollToIndex.transition);
        }
      }
    }, [scrollToIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (!currentScrollParent) {
        return (): void => null;
      }

      if (currentScrollParent === document.documentElement) {
        window.addEventListener("scroll", handleScroll, { passive: true });
      } else {
        currentScrollParent.addEventListener("scroll", handleScroll, {
          passive: true,
        });
      }

      return (): void => {
        if (currentScrollParent === document.documentElement) {
          window.removeEventListener("scroll", handleScroll);
        } else {
          currentScrollParent.removeEventListener("scroll", handleScroll);
        }
      };
    }, [currentScrollParent, handleScroll]);

    useEffect(() => {
      if (visibleRange?.startIndex) {
        if (onStartIndexChanged) {
          onStartIndexChanged(visibleRange?.startIndex);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleRange?.startIndex]);

    useEffect(() => {
      if (visibleRange?.endIndex) {
        if (onEndIndexChanged) {
          onEndIndexChanged(visibleRange?.endIndex);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleRange?.endIndex]);

    const totalSize = sizeAndPositionManager?.getTotalSize();
    const sizeStyle =
      totalSize !== undefined ? { [sizeProp[scrollDirection]]: totalSize } : {};

    return (
      <div
        ref={handleRef}
        style={{
          position: "relative",
          minWidth: "100%",
          minHeight: "100%",
          willChange: "transform",
          ...sizeStyle,
          ...style,
        }}
      >
        {items}
        {overlay && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              pointerEvents: "none",
            }}
          >
            {overlay}
          </div>
        )}
      </div>
    );
  }
);

export interface VirtualizedListProps {
  itemCount?: number;
  itemSize?: ItemSize;
  estimatedItemSize?: number;
  overscanCount?: number;
  scrollToIndex?: { index: number; transition: string };
  scrollDirection?: Direction;
  scrollToAlignment?: Alignment;
  style?: React.CSSProperties;
  overlay?: React.ReactNode;
  scrollParent?: HTMLElement | null;
  onScroll?(
    e: Event,
    scrollParent: HTMLElement,
    rootElement: HTMLElement,
    scrollPosition: number,
    reason: ScrollChangeReason
  ): void;
  onScrollToIndex?: () => void;
  onScrolledToEnd?: () => void;
  onRef?: (instance: HTMLDivElement | null) => void;
  onStartIndexChanged?: (index: number) => void;
  onEndIndexChanged?: (index: number) => void;
  onRenderItem?: (index: number) => void;
  children?: (props: ProvidedProps) => React.ReactNode;
}

const VirtualizedList = React.memo(
  (props: VirtualizedListProps): JSX.Element => {
    const {
      itemCount,
      itemSize,
      estimatedItemSize,
      overscanCount = 1,
      scrollToIndex,
      scrollDirection = Direction.Vertical,
      scrollToAlignment = Alignment.Center,
      style,
      overlay,
      scrollParent,
      onScroll,
      onScrollToIndex,
      onScrolledToEnd,
      onRef,
      onStartIndexChanged,
      onEndIndexChanged,
      onRenderItem,
      children,
    } = props;

    const sizeAndPositionManagerRef = useRef<SizeAndPositionManagerType>();
    const [sizeAndPositionManager, setSizeAndPositionManager] =
      useState<SizeAndPositionManagerType>();
    const [rootElement, setRootElement] = useState<HTMLElement>(scrollParent);
    const [currentScrollParent, setCurrentScrollParent] =
      useState<HTMLElement>(scrollParent);

    const [windowWidth, setWindowWidth] = useState(
      typeof window !== "undefined" ? window.innerWidth : undefined
    );
    const [windowHeight, setWindowHeight] = useState(
      typeof window !== "undefined" ? window.innerHeight : undefined
    );

    const handleScroll = useCallback(async (): Promise<void> => {
      if (sizeAndPositionManagerRef.current === undefined) {
        sizeAndPositionManagerRef.current = null;
        const SizeAndPositionManager = (
          await import("../classes/SizeAndPositionManager")
        ).default;
        sizeAndPositionManagerRef.current = new SizeAndPositionManager({
          itemCount,
          itemSize,
          estimatedItemSize: getEstimatedItemSize(estimatedItemSize, itemSize),
        });
        setSizeAndPositionManager(sizeAndPositionManagerRef.current);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const newScrollParent = findScrollParent(rootElement, scrollDirection);
      setCurrentScrollParent(newScrollParent);
    }, [rootElement, scrollDirection]);

    useEffect(() => {
      if (!currentScrollParent) {
        return (): void => null;
      }

      if (currentScrollParent === document.documentElement) {
        window.addEventListener("scroll", handleScroll, { passive: true });
      } else {
        currentScrollParent.addEventListener("scroll", handleScroll, {
          passive: true,
        });
      }

      return (): void => {
        if (currentScrollParent === document.documentElement) {
          window.removeEventListener("scroll", handleScroll);
        } else {
          currentScrollParent.removeEventListener("scroll", handleScroll);
        }
      };
    }, [currentScrollParent, handleScroll]);

    useEffect(() => {
      const onResize = debounce((): void => {
        if (itemSize === undefined) {
          setWindowWidth(window.innerWidth);
          setWindowHeight(window.innerHeight);
        }
      }, 200);

      onResize();

      window.addEventListener("resize", onResize, {
        passive: true,
      });

      return (): void => {
        window.removeEventListener("resize", onResize);
      };
    }, [itemSize, scrollDirection]);

    const handleRef = useCallback(
      (instance: HTMLDivElement) => {
        if (instance) {
          setRootElement(instance);
          if (onRef) {
            onRef(instance);
          }
        }
      },
      [onRef]
    );

    return (
      <VirtualizedListContent
        key={
          scrollDirection === Direction.Vertical ? windowWidth : windowHeight
        }
        sizeAndPositionManager={sizeAndPositionManager}
        itemCount={itemCount}
        itemSize={itemSize}
        estimatedItemSize={estimatedItemSize}
        overscanCount={overscanCount}
        scrollToIndex={scrollToIndex}
        scrollDirection={scrollDirection}
        scrollToAlignment={scrollToAlignment}
        style={style}
        overlay={overlay}
        scrollParent={scrollParent}
        onScroll={onScroll}
        onScrollToIndex={onScrollToIndex}
        onScrolledToEnd={onScrolledToEnd}
        onRef={handleRef}
        onStartIndexChanged={onStartIndexChanged}
        onEndIndexChanged={onEndIndexChanged}
        onRenderItem={onRenderItem}
      >
        {children}
      </VirtualizedListContent>
    );
  }
);

export default VirtualizedList;
