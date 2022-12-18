import React, { useCallback, useEffect, useMemo, useRef } from "react";

const RESIZER_DEFAULT_CLASSNAME = "Resizer";

const unFocus = (document, window): void => {
  if (document.selection) {
    document.selection.empty();
  } else {
    try {
      window.getSelection().removeAllRanges();
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }
};

const getDefaultSize = (defaultSize, minSize, maxSize, draggedSize): number => {
  if (typeof draggedSize === "number") {
    const min = typeof minSize === "number" ? minSize : 0;
    const max =
      typeof maxSize === "number" && maxSize >= 0 ? maxSize : Infinity;
    return Math.max(min, Math.min(max, draggedSize));
  }
  if (defaultSize !== undefined) {
    return defaultSize;
  }
  return minSize;
};

const getCSSSize = (size: number | string): string => {
  if (typeof size === "string") {
    return size;
  }
  if (typeof size === "number") {
    return `${size}px`;
  }
  return null;
};

const updateSize = (
  element: HTMLElement,
  size: number | string,
  split: "vertical" | "horizontal",
  isPrimary: boolean
): void => {
  element.style.width = split === "vertical" ? getCSSSize(size) : null;
  element.style.height = split === "horizontal" ? getCSSSize(size) : null;
  element.style.minWidth =
    isPrimary && split === "vertical" ? getCSSSize(size) : null;
  element.style.minHeight =
    isPrimary && split === "horizontal" ? getCSSSize(size) : null;
  element.style.maxWidth =
    isPrimary && split === "vertical" ? getCSSSize(size) : null;
  element.style.maxHeight =
    isPrimary && split === "horizontal" ? getCSSSize(size) : null;
};

interface SplitPaneProps {
  allowResize?: boolean;
  primary?: "first" | "second";
  split?: "vertical" | "horizontal";
  minSize?: number;
  maxSize?: number;
  defaultSize?: string | number;
  size?: string | number;
  step?: number;
  className?: string;
  paneClassName?: string;
  pane1ClassName?: string;
  pane2ClassName?: string;
  resizerClassName?: string;
  style?: React.CSSProperties;
  paneStyle?: React.CSSProperties;
  pane1Style?: React.CSSProperties;
  pane2Style?: React.CSSProperties;
  resizerStyle?: React.CSSProperties;
  children?: React.ReactNode;
  onDragStarted?: (size: number, totalSize: number) => void;
  onDragFinished?: (size: number, totalSize: number) => void;
  onChange?: (size: number, totalSize: number) => void;
  onResizerClick?: (e: React.MouseEvent) => void;
  onResizerDoubleClick?: (e: React.MouseEvent) => void;
}

const SplitPane = React.memo((props: SplitPaneProps) => {
  const {
    allowResize = true,
    primary = "first",
    split = "vertical",
    minSize = 50,
    maxSize,
    defaultSize,
    size,
    step,
    className,
    paneClassName = "",
    pane1ClassName = "",
    pane2ClassName = "",
    resizerClassName = "",
    style,
    paneStyle,
    pane1Style,
    pane2Style,
    resizerStyle,
    children,
    onDragStarted,
    onDragFinished,
    onChange,
    onResizerClick,
    onResizerDoubleClick,
  } = props;

  const initialSizeRef = useRef(size);
  const initialSize =
    defaultSize === undefined && initialSizeRef.current !== undefined
      ? size
      : getDefaultSize(defaultSize, minSize, maxSize, null);
  const initialPane1Size = primary === "first" ? initialSize : undefined;
  const initialPane2Size = primary === "second" ? initialSize : undefined;

  const activeRef = useRef(false);
  const startPositionRef = useRef<number>();
  const startSizeRef = useRef<number>();
  const totalSizeRef = useRef<number>();
  const reverseOrderRef = useRef<boolean>();
  const draggedSizeRef = useRef<number>();
  const splitRef = useRef(split);
  splitRef.current = split;

  const splitPaneRef = useRef<HTMLDivElement>();
  const pane1Ref = useRef<HTMLDivElement>();
  const pane2Ref = useRef<HTMLDivElement>();
  const resizerRef = useRef<HTMLDivElement>();

  const handlePointerDown = useCallback(
    (event: PointerEvent | React.PointerEvent): void => {
      if (allowResize) {
        event.preventDefault();
        unFocus(document, window);
        const position = split === "vertical" ? event.clientX : event.clientY;

        activeRef.current = true;
        startPositionRef.current = position;
        const isPrimaryFirst = primary === "first";
        const primaryRef = isPrimaryFirst ? pane1Ref.current : pane2Ref.current;
        const secondaryRef = isPrimaryFirst
          ? pane2Ref.current
          : pane1Ref.current;
        const pane1Order = Number(window.getComputedStyle(primaryRef).order);
        const pane2Order = Number(window.getComputedStyle(secondaryRef).order);
        reverseOrderRef.current = pane1Order > pane2Order;
        if (splitPaneRef.current) {
          const { width, height } =
            splitPaneRef.current.getBoundingClientRect();
          totalSizeRef.current = split === "vertical" ? width : height;
        }
        if (primaryRef) {
          const { width, height } = primaryRef.getBoundingClientRect();
          startSizeRef.current = split === "vertical" ? width : height;
        }
        if (typeof onDragStarted === "function") {
          onDragStarted(startSizeRef.current, totalSizeRef.current);
        }
      }
    },
    [allowResize, onDragStarted, primary, split]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent | React.PointerEvent): void => {
      if (allowResize && activeRef.current) {
        unFocus(document, window);
        const isPrimaryFirst = primary === "first";
        const currentPosition =
          split === "vertical" ? event.clientX : event.clientY;

        let positionDelta = startPositionRef.current - currentPosition;

        if (step) {
          if (Math.abs(positionDelta) < step) {
            return;
          }
          // Integer division
          // eslint-disable-next-line no-bitwise
          positionDelta = ~~(positionDelta / step) * step;
        }

        let newSize = startSizeRef.current - positionDelta;
        if (reverseOrderRef.current) {
          newSize = -newSize;
        }

        const validMinSize =
          minSize < 0 ? totalSizeRef.current + minSize : minSize;
        const validMaxSize =
          maxSize < 0 ? totalSizeRef.current + maxSize : maxSize;
        if (newSize < validMinSize) {
          newSize = validMinSize;
        } else if (newSize > validMaxSize) {
          newSize = validMaxSize;
        }

        onChange?.(newSize, totalSizeRef.current);

        draggedSizeRef.current = newSize;

        if (isPrimaryFirst) {
          updateSize(pane1Ref.current, newSize, split, true);
        } else {
          updateSize(pane2Ref.current, newSize, split, true);
        }
      }
    },
    [allowResize, maxSize, minSize, onChange, primary, split, step]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent | React.PointerEvent): void => {
      if (allowResize && activeRef.current) {
        event.preventDefault();
        if (onDragFinished) {
          onDragFinished(draggedSizeRef.current, totalSizeRef.current);
        }
        activeRef.current = false;
      }
    },
    [allowResize, onDragFinished]
  );

  const handleResizerClick = useCallback(
    (event: React.MouseEvent): void => {
      if (onResizerClick) {
        event.preventDefault();
        onResizerClick(event);
      }
    },
    [onResizerClick]
  );

  const handleMouseEnter = useCallback((event: React.MouseEvent): void => {
    if (!event.buttons) {
      if (resizerRef.current) {
        if (splitRef.current === "vertical") {
          resizerRef.current.style.cursor = "col-resize";
        } else {
          resizerRef.current.style.cursor = "row-resize";
        }
      }
    }
  }, []);

  const handleMouseLeave = useCallback((event: React.MouseEvent): void => {
    if (resizerRef.current) {
      resizerRef.current.style.cursor = null;
    }
  }, []);

  const handleResizerDoubleClick = useCallback(
    (event: React.MouseEvent): void => {
      if (onResizerDoubleClick) {
        event.preventDefault();
        onResizerDoubleClick(event);
      }
    },
    [onResizerDoubleClick]
  );

  useEffect(() => {
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    return (): void => {
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, [handlePointerUp, handlePointerMove]);

  useEffect(() => {
    const newSize =
      size !== undefined
        ? size
        : getDefaultSize(defaultSize, minSize, maxSize, draggedSizeRef.current);

    const isPrimaryFirst = primary === "first";

    if (isPrimaryFirst) {
      updateSize(pane1Ref.current, newSize, split, true);
      updateSize(pane2Ref.current, null, split, false);
    } else {
      updateSize(pane1Ref.current, null, split, false);
      updateSize(pane2Ref.current, newSize, split, true);
    }

    if (size !== undefined) {
      if (typeof newSize === "number") {
        draggedSizeRef.current = newSize;
      } else {
        const primaryRef = isPrimaryFirst ? pane1Ref.current : pane2Ref.current;
        if (primaryRef) {
          const { width, height } = primaryRef.getBoundingClientRect();
          draggedSizeRef.current = split === "vertical" ? width : height;
        }
      }
    }
  }, [defaultSize, maxSize, minSize, primary, size, split]);

  const disabledClass = allowResize ? "" : "disabled";

  const directionStyle: React.CSSProperties =
    split === "vertical"
      ? {
          flexDirection: "row",
          left: 0,
          right: 0,
        }
      : {
          bottom: 0,
          flexDirection: "column",
          minHeight: "100%",
          top: 0,
          width: "100%",
        };

  const styleState: React.CSSProperties = {
    display: "flex",
    flex: 1,
    height: "100%",
    position: "absolute",
    outline: "none",
    overflow: "hidden",
    MozUserSelect: "text",
    WebkitUserSelect: "text",
    msUserSelect: "text",
    userSelect: "text",
    ...directionStyle,
    ...style,
  };

  const classes = ["SplitPane", className, split, disabledClass]
    .filter((x) => Boolean(x))
    .join(" ");
  const pane1Classes = ["Pane1", paneClassName, pane1ClassName]
    .filter((x) => Boolean(x))
    .join(" ");
  const pane2Classes = ["Pane2", paneClassName, pane2ClassName]
    .filter((x) => Boolean(x))
    .join(" ");
  const resizerClasses = [
    RESIZER_DEFAULT_CLASSNAME,
    resizerClassName,
    split,
    disabledClass,
  ]
    .filter((x) => Boolean(x))
    .join(" ");

  const isPrimaryFirst = primary === "first";

  const initialPane1Style: React.CSSProperties = useMemo(
    () => ({
      position: "relative",
      outline: "none",
      flex: 1,
      width: split === "vertical" ? initialPane1Size : undefined,
      height: split === "horizontal" ? initialPane1Size : undefined,
      minWidth:
        isPrimaryFirst && split === "vertical" ? initialPane1Size : undefined,
      maxWidth:
        isPrimaryFirst && split === "vertical" ? initialPane1Size : undefined,
      minHeight:
        isPrimaryFirst && split === "horizontal" ? initialPane1Size : undefined,
      maxHeight:
        isPrimaryFirst && split === "horizontal" ? initialPane1Size : undefined,
      display: split === "horizontal" ? "flex" : undefined,
      ...paneStyle,
      ...pane1Style,
    }),
    [initialPane1Size, isPrimaryFirst, pane1Style, paneStyle, split]
  );

  const initialPane2Style: React.CSSProperties = useMemo(
    () => ({
      position: "relative",
      outline: "none",
      flex: 1,
      width: split === "vertical" ? initialPane2Size : undefined,
      height: split === "horizontal" ? initialPane2Size : undefined,
      minWidth:
        !isPrimaryFirst && split === "vertical" ? initialPane2Size : undefined,
      maxWidth:
        !isPrimaryFirst && split === "vertical" ? initialPane2Size : undefined,
      minHeight:
        !isPrimaryFirst && split === "horizontal"
          ? initialPane2Size
          : undefined,
      maxHeight:
        !isPrimaryFirst && split === "horizontal"
          ? initialPane2Size
          : undefined,
      display: split === "horizontal" ? "flex" : undefined,
      ...paneStyle,
      ...pane2Style,
    }),
    [initialPane2Size, isPrimaryFirst, pane2Style, paneStyle, split]
  );

  return (
    <div className={classes} ref={splitPaneRef} style={styleState}>
      <div
        className={pane1Classes}
        key="pane1"
        ref={pane1Ref}
        style={initialPane1Style}
      >
        {children[0]}
      </div>
      <span
        role="presentation"
        ref={resizerRef}
        className={resizerClasses}
        style={resizerStyle}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleResizerClick}
        onDoubleClick={handleResizerDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className={pane2Classes}
        key="pane2"
        ref={pane2Ref}
        style={initialPane2Style}
      >
        {children[1]}
      </div>
    </div>
  );
});

export default SplitPane;
