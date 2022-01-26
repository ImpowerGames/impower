import React, { useCallback, useEffect, useRef, useState } from "react";

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

interface SplitPaneProps {
  allowResize?: boolean;
  children?: React.ReactNode;
  className?: string;
  primary?: "first" | "second";
  minSize?: number;
  maxSize?: number;
  defaultSize?: string | number;
  size?: string | number;
  split?: "vertical" | "horizontal";
  onDragStarted?: () => void;
  onDragFinished?: (newSize: number | string) => void;
  onChange?: (newSize: number) => void;
  onResizerClick?: (e: React.MouseEvent) => void;
  onResizerDoubleClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  resizerStyle?: React.CSSProperties;
  paneClassName?: string;
  pane1ClassName?: string;
  pane2ClassName?: string;
  paneStyle?: React.CSSProperties;
  pane1Style?: React.CSSProperties;
  pane2Style?: React.CSSProperties;
  resizerClassName?: string;
  step?: number;
}

const SplitPane = React.memo((props: SplitPaneProps) => {
  const {
    size,
    defaultSize,
    minSize = 50,
    maxSize,
    primary = "first",
    split = "vertical",
    allowResize = true,
    paneClassName = "",
    pane1ClassName = "",
    pane2ClassName = "",
    children,
    className,
    onDragStarted,
    onDragFinished,
    onChange,
    onResizerClick,
    onResizerDoubleClick,
    style,
    resizerStyle,
    paneStyle,
    pane1Style,
    pane2Style,
    resizerClassName,
    step,
  } = props;

  const initialSize =
    size !== undefined
      ? size
      : getDefaultSize(defaultSize, minSize, maxSize, null);

  const [active, setActive] = useState(false);
  const [pane1Size, setPane1Size] = useState(
    primary === "first" ? initialSize : undefined
  );
  const [pane2Size, setPane2Size] = useState(
    primary === "second" ? initialSize : undefined
  );
  const [draggedSize, setDraggedSize] = useState<string | number>();
  const startPositionRef = useRef<number>();
  const startSizeRef = useRef<number>();
  const totalSizeRef = useRef<number>();
  const reverseOrderRef = useRef<boolean>();

  const splitPaneRef = useRef<HTMLDivElement>();
  const pane1Ref = useRef<HTMLDivElement>();
  const pane2Ref = useRef<HTMLDivElement>();

  const onTouchStart = useCallback(
    (event): void => {
      if (allowResize) {
        unFocus(document, window);
        const position =
          split === "vertical"
            ? event.touches[0].clientX
            : event.touches[0].clientY;

        if (typeof onDragStarted === "function") {
          onDragStarted();
        }
        setActive(true);
        startPositionRef.current = position;
        const isPrimaryFirst = primary === "first";
        const ref1 = isPrimaryFirst ? pane1Ref.current : pane2Ref.current;
        const ref2 = isPrimaryFirst ? pane2Ref.current : pane1Ref.current;
        const pane1Order = Number(window.getComputedStyle(ref1).order);
        const pane2Order = Number(window.getComputedStyle(ref2).order);
        reverseOrderRef.current = pane1Order > pane2Order;
        if (splitPaneRef.current) {
          const { width, height } =
            splitPaneRef.current.getBoundingClientRect();
          totalSizeRef.current = split === "vertical" ? width : height;
        }
        if (ref1) {
          const { width, height } = ref1.getBoundingClientRect();
          startSizeRef.current = split === "vertical" ? width : height;
        }
      }
    },
    [allowResize, onDragStarted, primary, split]
  );

  const onMouseDown = useCallback(
    (event): void => {
      onTouchStart({
        ...event,
        touches: [{ clientX: event.clientX, clientY: event.clientY }],
      });
    },
    [onTouchStart]
  );

  const onTouchMove = useCallback(
    (event): void => {
      if (allowResize && active) {
        unFocus(document, window);
        const isPrimaryFirst = primary === "first";
        const currentPosition =
          split === "vertical"
            ? event.touches[0].clientX
            : event.touches[0].clientY;

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

        onChange?.(newSize);

        setDraggedSize(newSize);

        if (isPrimaryFirst) {
          setPane1Size(newSize);
        } else {
          setPane2Size(newSize);
        }
      }
    },
    [active, allowResize, maxSize, minSize, onChange, primary, split, step]
  );

  const onMouseMove = useCallback(
    (event): void => {
      onTouchMove({
        ...event,
        touches: [{ clientX: event.clientX, clientY: event.clientY }],
      });
    },
    [onTouchMove]
  );

  const onTouchEnd = useCallback((): void => {
    if (allowResize && active) {
      if (typeof onDragFinished === "function") {
        onDragFinished(draggedSize);
      }
      setActive(false);
    }
  }, [active, allowResize, draggedSize, onDragFinished]);

  const onMouseUp = useCallback((): void => {
    onTouchEnd();
  }, [onTouchEnd]);

  useEffect(() => {
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onTouchMove, {
      passive: true,
    });
    return (): void => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [onMouseMove, onMouseUp, onTouchMove]);

  useEffect(() => {
    const newSize =
      size !== undefined
        ? size
        : getDefaultSize(defaultSize, minSize, maxSize, draggedSize);

    if (size !== undefined) {
      setDraggedSize(newSize);
    }

    const isPanel1Primary = primary === "first";

    if (isPanel1Primary) {
      setPane1Size(newSize);
      setPane2Size("100%");
    } else {
      setPane1Size("100%");
      setPane2Size(newSize);
    }
  }, [defaultSize, draggedSize, maxSize, minSize, primary, size]);

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

  return (
    <div className={classes} ref={splitPaneRef} style={styleState}>
      <div
        className={pane1Classes}
        key="pane1"
        ref={pane1Ref}
        style={{
          position: "relative",
          outline: "none",
          flex: size !== undefined ? "none" : 1,
          width: split === "vertical" ? pane1Size : undefined,
          height: split === "horizontal" ? pane1Size : undefined,
          minWidth:
            isPrimaryFirst && split === "vertical" ? pane1Size : undefined,
          maxWidth:
            isPrimaryFirst && split === "vertical" ? pane1Size : undefined,
          minHeight:
            isPrimaryFirst && split === "horizontal" ? pane1Size : undefined,
          maxHeight:
            isPrimaryFirst && split === "horizontal" ? pane1Size : undefined,
          display: split === "horizontal" ? "flex" : undefined,
          ...paneStyle,
          ...pane1Style,
        }}
      >
        {children[0]}
      </div>
      <span
        role="presentation"
        className={resizerClasses}
        style={resizerStyle || {}}
        onMouseDown={(event): void => {
          if (onMouseDown) {
            onMouseDown(event);
          }
        }}
        onTouchStart={(event): void => {
          if (onTouchStart) {
            event.preventDefault();
            onTouchStart(event);
          }
        }}
        onTouchEnd={(event): void => {
          if (onTouchEnd) {
            event.preventDefault();
            onTouchEnd();
          }
        }}
        onClick={(event): void => {
          if (onResizerClick) {
            event.preventDefault();
            onResizerClick(event);
          }
        }}
        onDoubleClick={(event): void => {
          if (onResizerDoubleClick) {
            event.preventDefault();
            onResizerDoubleClick(event);
          }
        }}
      />
      <div
        className={pane2Classes}
        key="pane2"
        ref={pane2Ref}
        style={{
          position: "relative",
          outline: "none",
          flex: size !== undefined ? "none" : 1,
          width: split === "vertical" ? pane2Size : undefined,
          height: split === "horizontal" ? pane2Size : undefined,
          minWidth:
            !isPrimaryFirst && split === "vertical" ? pane2Size : undefined,
          maxWidth:
            !isPrimaryFirst && split === "vertical" ? pane2Size : undefined,
          minHeight:
            !isPrimaryFirst && split === "horizontal" ? pane2Size : undefined,
          maxHeight:
            !isPrimaryFirst && split === "horizontal" ? pane2Size : undefined,
          display: split === "horizontal" ? "flex" : undefined,
          ...paneStyle,
          ...pane2Style,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
});

export default SplitPane;
