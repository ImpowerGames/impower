import { useTheme } from "@emotion/react";
import { easing } from "@material-ui/core/styles";
import { useForkRef } from "@material-ui/core/utils";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { getTransitionProps } from "../utils/getTransitionProps";

const defaultEasing = {
  enter: easing.easeOut,
  exit: easing.easeOut,
};

const defaultTimeout = {
  enter: 170,
  exit: 160,
};

const getY = (el: HTMLElement): number => {
  if (el) {
    return el.getBoundingClientRect().y;
  }
  return 0;
};

const getBottom = (el: HTMLElement, expandedHeight: number): number => {
  if (el) {
    return expandedHeight - el.getBoundingClientRect().bottom;
  }
  return 0;
};

const getHeight = (el: HTMLElement): number => {
  if (el) {
    return el.offsetHeight;
  }
  return window.innerHeight;
};

const getWrapperTransform = (
  type: "enter" | "exiting",
  collapsedOffsetTop: number,
  offsetHeaderHeight: number
): string => {
  const y =
    type === "enter"
      ? collapsedOffsetTop
      : collapsedOffsetTop - offsetHeaderHeight;
  return `translate3d(0, ${y}px, 0)`;
};

const getBottomOverflowYOffset = (
  type: "enter" | "exiting",
  collapsedOffsetTop: number,
  collapsedOffsetBottom: number,
  offsetHeaderHeight: number
): number => {
  const wrapperY =
    type === "enter"
      ? collapsedOffsetTop
      : collapsedOffsetTop - offsetHeaderHeight;
  const bottomOverflowY = -wrapperY - Math.max(0, collapsedOffsetBottom);
  return bottomOverflowY;
};

const getBottomOverflowTransform = (
  type: "enter" | "exiting",
  collapsedOffsetTop: number,
  collapsedOffsetBottom: number,
  offsetHeaderHeight: number
): string => {
  const bottomOverflowY = getBottomOverflowYOffset(
    type,
    collapsedOffsetTop,
    collapsedOffsetBottom,
    offsetHeaderHeight
  );
  return `translate3d(0, ${bottomOverflowY}px, 0)`;
};

const getTopOverflowTransform = (
  type: "enter" | "exiting",
  collapsedOffsetTop: number,
  collapsedOffsetBottom: number,
  offsetHeaderHeight: number
): string => {
  const bottomOverflowY = getBottomOverflowYOffset(
    "enter",
    collapsedOffsetTop,
    collapsedOffsetBottom,
    offsetHeaderHeight
  );
  return `translate3d(0, ${-bottomOverflowY}px, 0)`;
};

const getContainerTransform = (
  type: "enter" | "exiting",
  offsetHeaderHeight: number
): string => {
  const y = offsetHeaderHeight;
  return `translate3d(0, ${-y}px, 0)`;
};

const getStickyHeaderTransform = (
  type: "enter" | "exiting",
  offsetY: number,
  offsetHeaderHeight: number
): string => {
  const y = type === "enter" ? offsetY : offsetY - offsetHeaderHeight;
  return `translate3d(0, ${y}px, 0)`;
};

const getStickyFooterTransform = (
  type: "enter" | "entering" | "exit" | "exiting",
  collapsedHeight: number,
  expandedHeight: number,
  expandedContentHeight: number,
  collapsedOffsetTop: number,
  collapsedOffsetBottom: number,
  offsetHeaderHeight: number
): string => {
  if (type === "entering" || type === "exit") {
    const bottomOverflowY = Math.max(
      0,
      getBottomOverflowYOffset(
        "enter",
        collapsedOffsetTop,
        collapsedOffsetBottom,
        offsetHeaderHeight
      )
    );
    return `translate3d(0, ${-bottomOverflowY}px, 0)`;
  }
  const offsetY =
    collapsedHeight - Math.min(expandedHeight, expandedContentHeight);
  const y = Math.min(0, offsetY);
  return `translate3d(0, ${y}px, 0)`;
};

const getShadowTransform = (
  type: "enter" | "exiting",
  collapsedHeight: number,
  expandedHeight: number,
  offsetHeaderHeight: number
): string => {
  const y = type === "enter" ? 0 : offsetHeaderHeight;
  return `translate3d(0, ${y}px, 0) scaleY(${
    collapsedHeight / expandedHeight
  })`;
};

const getCroppedContentTransform = (
  type: "enter" | "exit" | "exiting",
  collapsedHeight: number,
  headerHeight: number,
  footerHeight: number,
  crop: number,
  scrollTop = 0
): string => {
  if (type === "exit") {
    return `translate3d(0, ${-scrollTop}px, 0)`;
  }
  return `translate3d(0, calc(-${crop * 100}% + ${
    (collapsedHeight - headerHeight - footerHeight) * 0.5
  }px), 0)`;
};

const getScrolledContentTransform = (
  type: "exit" | "exiting",
  scrollTop = 0
): string => {
  if (type === "exit") {
    return `translate3d(0, ${-scrollTop}px, 0)`;
  }
  return `translate3d(0, 0, 0)`;
};

interface CardTransitionProps {
  children?: React.ReactNode;
  easing?: { enter: string; exit: string };
  in?: boolean;
  timeout?: number | { enter: number; exit: number };
  itemEl?: HTMLElement;
  cardEl?: HTMLElement;
  offsetHeaderEl?: HTMLElement;
  offsetHeaderShadowEl?: HTMLElement;
  truncationAreaEl?: HTMLElement;
  truncationContentEl?: HTMLElement;
  headerEl?: HTMLElement;
  headerSentinelEl?: HTMLElement;
  footerEl?: HTMLElement;
  footerCoverEl?: HTMLElement;
  scrollEl?: HTMLElement;
  contentEl?: HTMLElement;
  crop?: number;
  offsetHeaderHeight?: number;
  maxWidth?: number;
  zIndex?: number;
  backgroundColor?: string;
  headerHeight?: number;
  footerHeight?: number;
  getRoot?: (item: HTMLElement) => HTMLElement;
  onEnter?: (node: HTMLElement) => void;
  onEntered?: (node: HTMLElement) => void;
  onEntering?: (node: HTMLElement) => void;
  onExit?: (node: HTMLElement) => void;
  onExited?: (node: HTMLElement) => void;
  onExiting?: (node: HTMLElement) => void;
  onClickBackdrop?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
}

const CardTransition = React.forwardRef<HTMLDivElement, CardTransitionProps>(
  (props: CardTransitionProps, ref) => {
    const {
      children,
      easing = defaultEasing,
      in: inProp,
      getRoot,
      onEnter,
      onEntered,
      onEntering,
      onExit,
      onExited,
      onExiting,
      onClickBackdrop,
      timeout = defaultTimeout,
      itemEl,
      cardEl,
      offsetHeaderEl,
      offsetHeaderShadowEl,
      truncationAreaEl,
      truncationContentEl,
      headerEl,
      headerSentinelEl,
      footerEl,
      footerCoverEl,
      scrollEl,
      contentEl,
      crop,
      headerHeight = 0,
      footerHeight = 0,
      offsetHeaderHeight = 0,
      maxWidth = 600,
      zIndex = 1300,
      backgroundColor = "white",
      style,
      wrapperStyle,
    } = props;

    const itemRef = useRef(itemEl);
    const cardRef = useRef(cardEl);
    const offsetHeaderRef = useRef(offsetHeaderEl);
    const offsetHeaderShadowRef = useRef(offsetHeaderShadowEl);
    const truncationAreaRef = useRef(truncationAreaEl);
    const truncationContentRef = useRef(truncationContentEl);
    const headerRef = useRef(headerEl);
    const headerSentinelRef = useRef(headerSentinelEl);
    const footerRef = useRef(footerEl);
    const footerCoverRef = useRef(footerCoverEl);
    const scrollRef = useRef(scrollEl);
    const contentRef = useRef(contentEl);
    const nodeRef = React.useRef(null);
    const handleRef = useForkRef(nodeRef, ref);
    const wrapperRef = useRef<HTMLDivElement>();
    const containerRef = useRef<HTMLDivElement>();
    const viewportAreaRef = useRef<HTMLDivElement>();
    const shadowAreaRef = useRef<HTMLDivElement>();
    const coverRef = useRef<HTMLDivElement>();
    const shadowRef = useRef<HTMLDivElement>();
    const backdropRef = useRef<HTMLDivElement>();
    const childrenAreaRef = useRef<HTMLDivElement>();
    const bottomOverflowRef = useRef<HTMLDivElement>();
    const topOverflowRef = useRef<HTMLDivElement>();
    const bottomRef = useRef<HTMLDivElement>();
    const collapsedHeightRef = useRef<number>();
    const collapsedOffsetTopRef = useRef<number>();
    const collapsedOffsetBottomRef = useRef<number>();
    const contentHeightRef = useRef<number>();
    const expandedHeightRef = useRef<number>();
    const expandedContentHeightRef = useRef<number>();
    const scrollTopRef = useRef<number>();
    const headerYRef = useRef<number>();
    const headerSentinelYRef = useRef<number>();
    const footerYRef = useRef<number>();
    const enterTimeoutHandle = useRef<number>();
    const exitTimeoutHandle = useRef<number>();
    const animatedInRef = useRef(false);
    const transformTransitionCallbackRef = useRef<() => void>();
    const dontMeasureRef = useRef(false);

    itemRef.current = itemEl;
    cardRef.current = cardEl;
    offsetHeaderRef.current = offsetHeaderEl;
    offsetHeaderShadowRef.current = offsetHeaderShadowEl;
    truncationAreaRef.current = truncationAreaEl;
    truncationContentRef.current = truncationContentEl;
    headerRef.current = headerEl;
    headerSentinelRef.current = headerSentinelEl;
    footerRef.current = footerEl;
    footerCoverRef.current = footerCoverEl;
    scrollRef.current = scrollEl;
    contentRef.current = contentEl;

    const theme = useTheme();

    useEffect(() => {
      window.requestAnimationFrame(() => {
        if (cardEl) {
          collapsedHeightRef.current = getHeight(cardEl);
        }
      });
    }, [cardEl]);

    useEffect(() => {
      window.requestAnimationFrame(() => {
        if (contentEl) {
          contentHeightRef.current = getHeight(contentEl);
        }
      });
    }, [contentEl]);

    useEffect(() => {
      if (!cardEl) {
        return (): void => null;
      }
      const onResize = (entry: ResizeObserverEntry): void => {
        if (entry && !dontMeasureRef.current) {
          const size = entry.contentRect.height;
          if (size > 0) {
            collapsedHeightRef.current = size;
          }
        }
      };
      const resizeObserver = new ResizeObserver(([entry]) => {
        onResize(entry);
      });
      resizeObserver.observe(cardEl);
      return (): void => {
        resizeObserver.disconnect();
      };
    }, [cardEl]);

    const handleSetupHints = useCallback((): void => {
      if (wrapperRef.current) {
        wrapperRef.current.style.willChange = "transform";
      }
      if (shadowAreaRef.current) {
        shadowAreaRef.current.style.willChange = "transform";
      }
      if (coverRef.current) {
        coverRef.current.style.willChange = "opacity";
      }
    }, []);

    const handleRemoveTransitions = useCallback((): void => {
      if (contentRef.current) {
        contentRef.current.style.transition = "none";
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.transition = "none";
      }
      if (bottomOverflowRef.current) {
        bottomOverflowRef.current.style.transition = "none";
      }
      if (topOverflowRef.current) {
        topOverflowRef.current.style.transition = "none";
      }
      if (offsetHeaderRef.current) {
        offsetHeaderRef.current.style.transition = "none";
      }
      if (offsetHeaderShadowRef.current) {
        offsetHeaderShadowRef.current.style.transition = "none";
      }
      if (containerRef.current) {
        containerRef.current.style.transition = "none";
      }
      if (headerRef.current) {
        headerRef.current.style.transition = "none";
      }
      if (footerRef.current) {
        footerRef.current.style.transition = "none";
      }
      if (shadowAreaRef.current) {
        shadowAreaRef.current.style.transition = "none";
      }
      if (bottomRef.current) {
        bottomRef.current.style.transition = "none";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "none";
      }
      if (shadowRef.current) {
        shadowRef.current.style.transition = "none";
      }
    }, []);

    const handleResetAnimations = useCallback(() => {
      if (contentRef.current) {
        contentRef.current.classList.remove("scrollable");
        contentRef.current.style.transform = null;
      }
      if (nodeRef.current) {
        nodeRef.current.style.position = null;
      }
      const root = getRoot?.(itemRef.current) || itemRef.current;
      if (root) {
        root.style.zIndex = null;
      }
      if (offsetHeaderRef.current) {
        offsetHeaderRef.current.style.display = "none";
        offsetHeaderRef.current.style.transform = "scaleY(0)";
        offsetHeaderRef.current.style.opacity = `0`;
      }
      if (offsetHeaderShadowRef.current) {
        offsetHeaderShadowRef.current.style.opacity = "0";
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = null;
      }
      if (
        wrapperRef.current &&
        bottomOverflowRef.current &&
        topOverflowRef.current
      ) {
        wrapperRef.current.style.marginRight = null;
        bottomOverflowRef.current.style.marginRight = null;
        topOverflowRef.current.style.paddingRight = null;
      }
      if (bottomOverflowRef.current) {
        bottomOverflowRef.current.style.contain = null;
        bottomOverflowRef.current.style.overflow = null;
        bottomOverflowRef.current.style.transform = null;
      }
      if (topOverflowRef.current) {
        topOverflowRef.current.style.overflow = null;
        topOverflowRef.current.style.transform = null;
      }
      if (containerRef.current) {
        containerRef.current.style.transform = null;
      }
      if (headerRef.current) {
        headerRef.current.style.transform = null;
      }
      if (footerRef.current) {
        footerRef.current.style.transform = null;
      }
      if (bottomRef.current) {
        bottomRef.current.style.opacity = "0";
      }
      if (footerCoverRef.current) {
        footerCoverRef.current.style.display = "none";
      }
      if (backdropRef.current) {
        backdropRef.current.style.visibility = "hidden";
      }
      if (viewportAreaRef.current) {
        viewportAreaRef.current.style.display = "none";
      }
      if (shadowAreaRef.current) {
        shadowAreaRef.current.style.display = "none";
      }
    }, [getRoot]);

    const handleEnter = useCallback((): void => {
      dontMeasureRef.current = true;

      handleSetupHints();

      handleRemoveTransitions();

      if (onEnter) {
        onEnter(nodeRef.current);
      }

      if (coverRef.current) {
        coverRef.current.style.transition = "none";
        coverRef.current.style.opacity = "0";
      }

      expandedHeightRef.current = getHeight(backdropRef.current);
      collapsedOffsetTopRef.current = getY(cardRef.current);
      collapsedOffsetBottomRef.current = getBottom(
        cardRef.current,
        expandedHeightRef.current
      );

      if (backdropRef.current) {
        backdropRef.current.style.visibility = "visible";
      }
      if (shadowAreaRef.current) {
        shadowAreaRef.current.style.display = "block";
      }

      const height = `${collapsedHeightRef.current}px`;
      if (truncationAreaRef.current) {
        truncationAreaRef.current.style.height = height;
      }
      if (truncationContentRef.current) {
        truncationContentRef.current.style.height = height;
      }
      if (contentRef.current) {
        contentRef.current.style.height = `${
          collapsedHeightRef.current - footerHeight * 2
        }px`;
      }
    }, [footerHeight, handleRemoveTransitions, handleSetupHints, onEnter]);

    const handleEntering = useCallback(() => {
      if (!enterTimeoutHandle.current) {
        return;
      }
      const bottomOverflowY = Math.max(
        0,
        getBottomOverflowYOffset(
          "enter",
          collapsedOffsetTopRef.current,
          collapsedOffsetBottomRef.current,
          offsetHeaderHeight
        )
      );

      if (nodeRef.current) {
        nodeRef.current.style.position = "fixed";
      }
      const root = getRoot?.(itemRef.current) || itemRef.current;
      if (root) {
        root.style.zIndex = `${zIndex}`;
      }

      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }

      if (
        wrapperRef.current &&
        bottomOverflowRef.current &&
        topOverflowRef.current
      ) {
        const bodyPadding = document.body.style.paddingRight;
        wrapperRef.current.style.marginRight = `${bodyPadding}`;
        bottomOverflowRef.current.style.marginRight = `-${bodyPadding}`;
        topOverflowRef.current.style.paddingRight = `${bodyPadding}`;
      }

      if (headerRef.current) {
        headerYRef.current = getY(headerRef.current);
      }
      if (footerRef.current) {
        footerYRef.current = getY(footerRef.current);
      }
      if (footerCoverRef.current) {
        footerCoverRef.current.style.display = "block";
      }
      if (headerSentinelRef.current) {
        headerSentinelYRef.current = getY(headerSentinelRef.current);
      }

      if (truncationAreaRef.current) {
        truncationAreaRef.current.style.height = null;
      }
      if (truncationContentRef.current) {
        truncationContentRef.current.style.height = null;
      }
      if (contentRef.current) {
        contentRef.current.style.height = null;
        contentRef.current.style.transform = getCroppedContentTransform(
          "enter",
          collapsedHeightRef.current,
          headerHeight,
          footerHeight,
          crop
        );
        const child = contentRef.current.firstElementChild as HTMLElement;
        if (child) {
          child.style.transform = null;
        }
      }

      if (onEntering) {
        onEntering(nodeRef.current);
      }

      if (truncationContentRef.current) {
        expandedContentHeightRef.current = getHeight(
          truncationContentRef.current
        );
      }

      if (headerRef.current) {
        headerRef.current.style.transform = getStickyHeaderTransform(
          "enter",
          headerYRef.current - headerSentinelYRef.current,
          offsetHeaderHeight
        );
      }
      if (footerRef.current) {
        footerRef.current.style.transform = getStickyFooterTransform(
          "enter",
          collapsedHeightRef.current,
          expandedHeightRef.current,
          expandedContentHeightRef.current,
          collapsedOffsetTopRef.current,
          collapsedOffsetBottomRef.current,
          offsetHeaderHeight
        );
      }

      if (contentRef.current) {
        contentRef.current.classList.add("scrollable");
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = getWrapperTransform(
          "enter",
          collapsedOffsetTopRef.current,
          offsetHeaderHeight
        );
      }
      if (bottomOverflowRef.current) {
        bottomOverflowRef.current.style.overflow = "hidden";
        bottomOverflowRef.current.style.transform = getBottomOverflowTransform(
          "enter",
          collapsedOffsetTopRef.current,
          collapsedOffsetBottomRef.current,
          offsetHeaderHeight
        );
      }
      if (topOverflowRef.current) {
        topOverflowRef.current.style.overflow = "hidden";
        topOverflowRef.current.style.transform = getTopOverflowTransform(
          "enter",
          collapsedOffsetTopRef.current,
          collapsedOffsetBottomRef.current,
          offsetHeaderHeight
        );
        const minHeight = `calc(100% + ${bottomOverflowY}px)`;
        topOverflowRef.current.style.minHeight = minHeight;
      }
      if (containerRef.current?.style) {
        containerRef.current.style.transform = getContainerTransform(
          "enter",
          offsetHeaderHeight
        );
        const maxHeight = `calc(100% - ${bottomOverflowY}px)`;
        containerRef.current.style.maxHeight = maxHeight;
      }
      if (shadowAreaRef.current) {
        shadowAreaRef.current.style.transform = getShadowTransform(
          "enter",
          collapsedHeightRef.current,
          expandedHeightRef.current,
          offsetHeaderHeight
        );
      }
      if (containerRef.current) {
        containerRef.current.style.transform = getContainerTransform(
          "enter",
          offsetHeaderHeight
        );
      }
      if (offsetHeaderRef.current) {
        offsetHeaderRef.current.style.transformOrigin = `center ${offsetHeaderHeight}px`;
        offsetHeaderRef.current.style.transform = `scaleY(0)`;
        offsetHeaderRef.current.style.opacity = `0`;
        offsetHeaderRef.current.style.display = null;
      }
      if (offsetHeaderShadowRef.current) {
        offsetHeaderShadowRef.current.style.opacity = "0";
      }
      if (backdropRef.current) {
        backdropRef.current.style.opacity = "0";
      }
      if (bottomRef.current) {
        bottomRef.current.style.opacity = "1";
      }
      if (shadowRef.current) {
        shadowRef.current.style.opacity = "0";
      }

      enterTimeoutHandle.current = window.requestAnimationFrame(() => {
        if (!enterTimeoutHandle.current) {
          return;
        }
        const {
          duration: transitionDuration,
          easing: transitionTimingFunction,
        } = getTransitionProps(
          { style, timeout, easing },
          {
            mode: "enter",
          }
        );
        const transformDuration = transitionDuration;
        const transformTransition = theme.transitions.create("transform", {
          duration: transformDuration,
          delay: 0,
          easing: transitionTimingFunction,
        });
        if (contentRef.current) {
          contentRef.current.style.transition = transformTransition;
        }
        if (wrapperRef.current) {
          wrapperRef.current.style.transition = transformTransition;
        }
        if (bottomOverflowRef.current) {
          bottomOverflowRef.current.style.transition = transformTransition;
        }
        if (topOverflowRef.current) {
          topOverflowRef.current.style.transition = transformTransition;
        }
        if (containerRef.current) {
          containerRef.current.style.transition = transformTransition;
        }
        if (headerRef.current) {
          headerRef.current.style.transition = transformTransition;
        }
        if (footerRef.current) {
          footerRef.current.style.transition = transformTransition;
        }
        if (shadowAreaRef.current) {
          shadowAreaRef.current.style.transition = transformTransition;
        }
        const opacityDuration = transitionDuration;
        const opacityTransition = theme.transitions.create("opacity", {
          duration: opacityDuration,
          delay: 0,
          easing: transitionTimingFunction,
        });
        if (backdropRef.current) {
          backdropRef.current.style.transition = opacityTransition;
        }
        if (shadowRef.current) {
          shadowRef.current.style.transition = opacityTransition;
        }
        if (offsetHeaderRef.current) {
          offsetHeaderRef.current.style.transition = [
            transformTransition,
            opacityTransition,
          ].join(", ");
        }
        if (offsetHeaderShadowRef.current) {
          offsetHeaderShadowRef.current.style.transition = opacityTransition;
        }
        if (backdropRef.current) {
          backdropRef.current.style.opacity = "1";
        }
        if (shadowRef.current) {
          shadowRef.current.style.opacity = "1";
        }
        if (offsetHeaderShadowRef.current) {
          offsetHeaderShadowRef.current.style.opacity = `1`;
        }
        if (offsetHeaderRef.current) {
          offsetHeaderRef.current.style.transform = `scaleY(1)`;
          offsetHeaderRef.current.style.opacity = `1`;
        }
        if (contentRef.current) {
          contentRef.current.style.transform = null;
        }
        if (wrapperRef.current) {
          wrapperRef.current.style.transform = `translate3d(0, 0, 0)`;
        }
        if (bottomOverflowRef.current) {
          bottomOverflowRef.current.style.transform = `translate3d(0, 0, 0)`;
        }
        if (topOverflowRef.current) {
          topOverflowRef.current.style.transform = `translate3d(0, 0, 0)`;
        }
        if (containerRef.current) {
          containerRef.current.style.transform = `translate3d(0, 0, 0)`;
        }
        if (headerRef.current) {
          headerRef.current.style.transform = `translate3d(0, 0, 0)`;
        }
        if (footerRef.current) {
          footerRef.current.style.transform = getStickyFooterTransform(
            "entering",
            collapsedHeightRef.current,
            expandedHeightRef.current,
            expandedContentHeightRef.current,
            collapsedOffsetTopRef.current,
            collapsedOffsetBottomRef.current,
            offsetHeaderHeight
          );
        }
        if (shadowAreaRef.current) {
          shadowAreaRef.current.style.transform = `translate3d(0, 0, 0) scaleY(1)`;
        }
      });
    }, [
      crop,
      easing,
      footerHeight,
      getRoot,
      headerHeight,
      offsetHeaderHeight,
      onEntering,
      style,
      theme.transitions,
      timeout,
      zIndex,
    ]);

    const handleEntered = useCallback(() => {
      if (!enterTimeoutHandle.current) {
        return;
      }
      if (onEntered) {
        onEntered(nodeRef.current);
      }
      if (viewportAreaRef.current) {
        viewportAreaRef.current.style.display = "block";
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = null;
      }
      if (bottomOverflowRef.current) {
        bottomOverflowRef.current.style.transform = null;
        bottomOverflowRef.current.style.contain = "size layout paint style";
      }
      if (topOverflowRef.current) {
        topOverflowRef.current.style.transform = null;
      }
      if (containerRef.current) {
        containerRef.current.style.transform = null;
      }
      if (offsetHeaderRef.current) {
        offsetHeaderRef.current.style.transform = null;
      }
      if (offsetHeaderShadowRef.current) {
        offsetHeaderShadowRef.current.style.opacity = null;
      }
      if (headerRef.current) {
        headerRef.current.style.transition = "none";
        headerRef.current.style.transform = null;
      }
      if (footerRef.current) {
        footerRef.current.style.transition = "none";
        footerRef.current.style.transform = null;
      }
      if (footerCoverRef.current) {
        footerCoverRef.current.style.display = "none";
      }
      if (shadowAreaRef.current) {
        shadowAreaRef.current.style.transform = null;
      }
    }, [onEntered]);

    const handleExit = useCallback(() => {
      scrollTopRef.current = scrollRef.current
        ? scrollRef.current.scrollTop
        : 0;

      if (onExit) {
        onExit(nodeRef.current);
      }

      if (viewportAreaRef.current) {
        viewportAreaRef.current.style.display = "none";
      }

      if (footerRef.current) {
        footerRef.current.style.transition = "none";
        footerRef.current.style.transform = getStickyFooterTransform(
          "exit",
          collapsedHeightRef.current,
          expandedHeightRef.current,
          expandedContentHeightRef.current,
          collapsedOffsetTopRef.current,
          collapsedOffsetBottomRef.current,
          offsetHeaderHeight
        );
      }
      if (contentRef.current) {
        contentRef.current.style.transition = "none";
        if (crop !== undefined) {
          contentRef.current.style.transform = getCroppedContentTransform(
            "exit",
            collapsedHeightRef.current,
            headerHeight,
            footerHeight,
            crop,
            scrollTopRef.current
          );
        } else {
          contentRef.current.style.transform = getScrolledContentTransform(
            "exit",
            scrollTopRef.current
          );
        }
      }
    }, [crop, footerHeight, headerHeight, offsetHeaderHeight, onExit]);

    const handleExiting = useCallback(() => {
      if (!exitTimeoutHandle.current) {
        return;
      }
      if (onExiting) {
        onExiting(nodeRef.current);
      }
      const {
        duration: transitionDuration,
        delay,
        easing: transitionTimingFunction,
      } = getTransitionProps(
        { style, timeout, easing },
        {
          mode: "exit",
        }
      );
      const transformDuration = transitionDuration;
      const transformTransition = theme.transitions.create("transform", {
        duration: transformDuration,
        delay,
        easing: transitionTimingFunction,
      });
      if (contentRef.current) {
        contentRef.current.style.transition = transformTransition;
      } else if (coverRef.current) {
        const opacityDuration = transitionDuration;
        const opacityTransition = theme.transitions.create("opacity", {
          duration: opacityDuration,
          delay: 0,
          easing: transitionTimingFunction,
        });
        coverRef.current.style.transition = opacityTransition;
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.transition = transformTransition;
      }
      if (bottomOverflowRef.current) {
        bottomOverflowRef.current.style.transition = transformTransition;
      }
      if (topOverflowRef.current) {
        topOverflowRef.current.style.transition = transformTransition;
      }
      if (containerRef.current) {
        containerRef.current.style.transition = transformTransition;
      }
      if (headerRef.current) {
        headerRef.current.style.transition = transformTransition;
      }
      if (footerRef.current) {
        footerRef.current.style.transition = transformTransition;
      }
      if (shadowAreaRef.current) {
        shadowAreaRef.current.style.transition = transformTransition;
      }
      const opacityDuration = transitionDuration;
      const opacityTransition = theme.transitions.create("opacity", {
        duration: opacityDuration,
        delay: transformDuration - opacityDuration,
        easing: transitionTimingFunction,
      });
      if (shadowRef.current) {
        shadowRef.current.style.transition = opacityTransition;
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = opacityTransition;
      }
      if (offsetHeaderRef.current) {
        offsetHeaderRef.current.style.transition = [
          transformTransition,
          opacityTransition,
        ].join(", ");
      }
      if (offsetHeaderShadowRef.current) {
        offsetHeaderShadowRef.current.style.transition = opacityTransition;
      }
      exitTimeoutHandle.current = window.requestAnimationFrame(() => {
        if (!exitTimeoutHandle.current) {
          return;
        }
        if (contentRef.current) {
          if (crop !== undefined) {
            contentRef.current.style.transform = getCroppedContentTransform(
              "exiting",
              collapsedHeightRef.current,
              headerHeight,
              footerHeight,
              crop,
              scrollTopRef.current
            );
          } else {
            contentRef.current.style.transform = getScrolledContentTransform(
              "exiting",
              scrollTopRef.current
            );
          }
        } else if (coverRef.current) {
          if (scrollTopRef.current > 1) {
            coverRef.current.style.opacity = "1";
          }
        }
        if (wrapperRef.current) {
          wrapperRef.current.style.transform = getWrapperTransform(
            "exiting",
            collapsedOffsetTopRef.current,
            offsetHeaderHeight
          );
        }
        if (bottomOverflowRef.current) {
          bottomOverflowRef.current.style.transform =
            getBottomOverflowTransform(
              "exiting",
              collapsedOffsetTopRef.current,
              collapsedOffsetBottomRef.current,
              offsetHeaderHeight
            );
        }
        const bottomOverflowY = Math.max(
          0,
          getBottomOverflowYOffset(
            "exiting",
            collapsedOffsetTopRef.current,
            collapsedOffsetBottomRef.current,
            offsetHeaderHeight
          )
        );
        if (topOverflowRef.current) {
          topOverflowRef.current.style.overflow = "hidden";
          topOverflowRef.current.style.transform = getTopOverflowTransform(
            "exiting",
            collapsedOffsetTopRef.current,
            collapsedOffsetBottomRef.current,
            offsetHeaderHeight
          );
          const minHeight = `calc(100% + ${bottomOverflowY}px)`;
          topOverflowRef.current.style.minHeight = minHeight;
        }
        if (containerRef.current?.style) {
          containerRef.current.style.transform = getContainerTransform(
            "exiting",
            offsetHeaderHeight
          );
          const maxHeight = `calc(100% - ${bottomOverflowY}px)`;
          containerRef.current.style.maxHeight = maxHeight;
        }
        if (offsetHeaderRef.current) {
          offsetHeaderRef.current.style.transform = `scaleY(0)`;
          offsetHeaderRef.current.style.opacity = `0`;
        }
        if (offsetHeaderShadowRef.current) {
          offsetHeaderShadowRef.current.style.opacity = `0`;
        }
        if (headerRef.current) {
          headerRef.current.style.transform = getStickyHeaderTransform(
            "exiting",
            headerYRef.current - headerSentinelYRef.current,
            offsetHeaderHeight
          );
        }
        if (footerRef.current) {
          footerRef.current.style.transform = getStickyFooterTransform(
            "exiting",
            collapsedHeightRef.current,
            expandedHeightRef.current,
            expandedContentHeightRef.current,
            collapsedOffsetTopRef.current,
            collapsedOffsetBottomRef.current,
            offsetHeaderHeight
          );
        }
        if (footerCoverRef.current) {
          footerCoverRef.current.style.display = "block";
        }
        if (shadowAreaRef.current) {
          shadowAreaRef.current.style.transform = getShadowTransform(
            "exiting",
            collapsedHeightRef.current,
            expandedHeightRef.current,
            offsetHeaderHeight
          );
        }
        if (backdropRef.current) {
          backdropRef.current.style.opacity = "0";
        }
        if (shadowRef.current) {
          shadowRef.current.style.opacity = "0";
        }
      });
    }, [
      crop,
      easing,
      footerHeight,
      headerHeight,
      offsetHeaderHeight,
      onExiting,
      style,
      theme.transitions,
      timeout,
    ]);

    const handleExited = useCallback(() => {
      if (!exitTimeoutHandle.current) {
        return;
      }
      if (topOverflowRef.current) {
        topOverflowRef.current.style.minHeight = null;
      }
      if (containerRef.current) {
        containerRef.current.style.maxHeight = null;
      }
      if (!contentRef.current) {
        if (scrollRef.current && scrollTopRef.current > 1) {
          scrollRef.current.scrollTop = 0;
        }
        if (coverRef.current) {
          coverRef.current.style.opacity = "0";
        }
      }
      handleRemoveTransitions();
      handleResetAnimations();
      if (onExited) {
        onExited(nodeRef.current);
      }
      dontMeasureRef.current = false;
    }, [handleRemoveTransitions, handleResetAnimations, onExited]);

    const handleIn = useCallback(() => {
      animatedInRef.current = true;

      if (exitTimeoutHandle.current) {
        window.cancelAnimationFrame(exitTimeoutHandle.current);
        exitTimeoutHandle.current = 0;
      }
      enterTimeoutHandle.current = window.requestAnimationFrame(() => {
        if (enterTimeoutHandle.current) {
          handleEnter();
        }
        enterTimeoutHandle.current = window.requestAnimationFrame(() => {
          if (enterTimeoutHandle.current) {
            handleEntering();
          }
          transformTransitionCallbackRef.current = (): void => {
            enterTimeoutHandle.current = window.requestAnimationFrame(() => {
              if (enterTimeoutHandle.current) {
                handleEntered();
              }
            });
          };
        });
      });
    }, [handleEnter, handleEntered, handleEntering]);

    const handleOut = useCallback(() => {
      if (enterTimeoutHandle.current) {
        window.cancelAnimationFrame(enterTimeoutHandle.current);
        enterTimeoutHandle.current = 0;
      }
      exitTimeoutHandle.current = window.requestAnimationFrame(() => {
        if (exitTimeoutHandle.current) {
          handleExit();
        }
        exitTimeoutHandle.current = window.requestAnimationFrame(() => {
          if (exitTimeoutHandle.current) {
            handleExiting();
          }
          transformTransitionCallbackRef.current = (): void => {
            exitTimeoutHandle.current = window.requestAnimationFrame(() => {
              if (exitTimeoutHandle.current) {
                handleExited();
              }
            });
          };
        });
      });
    }, [handleExit, handleExited, handleExiting]);

    useEffect(() => {
      if (inProp) {
        handleIn();
      } else if (animatedInRef.current) {
        handleOut();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inProp]);

    const defaultNodeStyle: React.CSSProperties = useMemo(
      () => ({
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        ...style,
      }),
      [style]
    );
    const defaultWrapperStyle: React.CSSProperties = useMemo(
      () => ({
        flex: 1,
        pointerEvents: "none",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        transformOrigin: "top center",
        ...wrapperStyle,
      }),
      [wrapperStyle]
    );
    const defaultBottomOverflowStyle: React.CSSProperties = useMemo(
      () => ({
        pointerEvents: "none",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      }),
      []
    );
    const defaultTopOverflowStyle: React.CSSProperties = useMemo(
      () => ({
        pointerEvents: "none",
        height: "100%",
        position: "relative",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      }),
      []
    );
    const defaultContainerStyle: React.CSSProperties = useMemo(
      () => ({
        pointerEvents: "none",
        position: "relative",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        maxWidth,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        margin: "auto",
      }),
      [maxWidth]
    );
    const defaultShadowAreaStyle: React.CSSProperties = useMemo(
      () => ({
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
        transformOrigin: "top center",
        zIndex: 3000,
        display: "none",
      }),
      []
    );
    const defaultBackdropStyle: React.CSSProperties = useMemo(
      () => ({
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        opacity: 0,
        visibility: "hidden",
        pointerEvents: "auto",
      }),
      []
    );
    const defaultAbsoluteStyle: React.CSSProperties = useMemo(
      () => ({
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: "none",
        display: "none",
        ...wrapperStyle,
      }),
      [wrapperStyle]
    );
    const defaultBottomStyle: React.CSSProperties = useMemo(
      () => ({
        height: "100%",
        width: "100%",
        maxWidth,
        margin: "auto",
        position: "relative",
      }),
      [maxWidth]
    );
    const defaultShadowStyle: React.CSSProperties = useMemo(
      () => ({
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        boxShadow: theme.shadows[24],
        opacity: 0,
      }),
      [theme.shadows]
    );
    const defaultCoverStyle: React.CSSProperties = useMemo(
      () => ({
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor,
        opacity: 0,
      }),
      [backgroundColor]
    );
    const defaultChildrenAreaStyle: React.CSSProperties = useMemo(
      () => ({
        flex: 1,
        position: "relative",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }),
      []
    );
    const defaultViewportContainerStyle: React.CSSProperties = useMemo(
      () => ({
        height: "100vh",
        width: "100%",
        maxWidth,
        margin: "auto",
        position: "relative",
        backgroundColor,
        opacity: 0,
      }),
      [backgroundColor, maxWidth]
    );

    const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
      if (e.propertyName === "transform" && e.target === wrapperRef.current) {
        transformTransitionCallbackRef.current?.();
      }
    }, []);

    return (
      <div
        className="card-transition-node"
        ref={handleRef}
        style={defaultNodeStyle}
      >
        <div
          className="card-transition-backdrop"
          ref={backdropRef}
          style={defaultBackdropStyle}
          role="presentation"
          onClick={onClickBackdrop}
        />
        <div
          ref={viewportAreaRef}
          className="card-transition-absolute"
          style={defaultAbsoluteStyle}
        >
          <div
            className="card-transition-viewport-container"
            style={defaultViewportContainerStyle}
          />
        </div>
        <div
          className={"card-transition-wrapper"}
          ref={wrapperRef}
          style={defaultWrapperStyle}
          onTransitionEnd={handleTransitionEnd}
        >
          <div
            className="card-transition-bottom-overflow"
            ref={bottomOverflowRef}
            style={defaultBottomOverflowStyle}
          >
            <div
              className="card-transition-top-overflow"
              ref={topOverflowRef}
              style={defaultTopOverflowStyle}
            >
              <div
                className="card-transition-container"
                ref={containerRef}
                style={defaultContainerStyle}
              >
                <div
                  className="card-transition-children-area"
                  ref={childrenAreaRef}
                  style={defaultChildrenAreaStyle}
                >
                  {children}
                </div>
              </div>
            </div>
          </div>
          <div
            className="card-transition-shadow-area"
            ref={shadowAreaRef}
            style={defaultShadowAreaStyle}
          >
            <div
              className="card-transition-bottom"
              ref={bottomRef}
              style={defaultBottomStyle}
            >
              {!contentEl && (
                <div
                  className="card-transition-cover"
                  ref={coverRef}
                  style={defaultCoverStyle}
                />
              )}
              <div
                className="card-transition-shadow"
                ref={shadowRef}
                style={defaultShadowStyle}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export default CardTransition;
