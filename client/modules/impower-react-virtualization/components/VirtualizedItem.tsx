import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MeasuredBox from "./MeasuredBox";

interface VirtualizedItemProps {
  contentRef?: React.Ref<HTMLDivElement>;
  measureEl?: HTMLElement;
  index?: number;
  isolatedIndex?: number;
  minHeight?: number;
  minValidHeight?: number;
  /** How far outside the viewport in pixels should elements be considered visible?  */
  visibleOffset?: number;
  root?: HTMLElement | null;
  mounted?: boolean;
  displayed?: boolean;
  dontMeasure?: boolean;
  initiallyMountedCount?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  placeholderStyle?: React.CSSProperties;
  onVisibilityChange?: (
    index?: number,
    visible?: boolean,
    action?: "mount" | "unmount" | "none"
  ) => void;
}

const VirtualizedItem = React.forwardRef(
  (props: VirtualizedItemProps, ref): JSX.Element => {
    const {
      contentRef,
      measureEl,
      mounted,
      initiallyMountedCount = 10,
      index,
      isolatedIndex,
      minHeight,
      minValidHeight = 32,
      visibleOffset = 1000,
      root = null,
      dontMeasure,
      style,
      placeholderStyle,
      contentStyle,
      children,
      onVisibilityChange,
      ...other
    } = props;

    const visibleRef = useRef(
      mounted !== undefined ||
        minHeight === undefined ||
        typeof window === "undefined" ||
        index < initiallyMountedCount
    );
    const mountedRef = useRef(visibleRef.current);
    const [mountedState, setMountedState] = useState(mountedRef.current);
    const [wrapperEl, setWrapperEl] = useState<HTMLDivElement>();
    const [contentEl, setContentEl] = useState<HTMLDivElement>();
    const wrapperElRef = useRef(wrapperEl);
    const contentElRef = useRef(contentEl);
    const dontMeasureRef = useRef(dontMeasure);

    wrapperElRef.current = wrapperEl;
    contentElRef.current = contentEl;
    dontMeasureRef.current = dontMeasure;

    useEffect(() => {
      if (mounted !== undefined) {
        if (mountedRef.current !== mounted) {
          mountedRef.current = mounted;
          setMountedState(mountedRef.current);
        }
      }
    }, [mounted]);

    useEffect(() => {
      if (isolatedIndex !== undefined) {
        const display =
          isolatedIndex !== null && index !== isolatedIndex ? "none" : null;
        if (
          contentElRef.current &&
          contentElRef.current.style.display !== display
        ) {
          contentElRef.current.style.display = display;
        }
      }
    }, [index, isolatedIndex]);

    // Set visibility with intersection observer
    useEffect(() => {
      if (!wrapperEl || (!onVisibilityChange && mounted !== undefined)) {
        return (): void => null;
      }
      const onCheckVisibility = (entry: IntersectionObserverEntry): void => {
        if (
          entry &&
          (entry.boundingClientRect.width > 0 ||
            entry.boundingClientRect.height > 0)
        ) {
          const currentlyVisible =
            entry.isIntersecting || entry.intersectionRatio > 0;
          if (visibleRef.current !== currentlyVisible) {
            visibleRef.current = currentlyVisible;
            const action =
              mounted === undefined && !mountedRef.current && visibleRef.current
                ? "mount"
                : mounted === undefined &&
                  mountedRef.current &&
                  !visibleRef.current
                ? "unmount"
                : "none";
            if (action === "mount") {
              mountedRef.current = true;
              setMountedState(mountedRef.current);
            }
            if (action === "unmount") {
              mountedRef.current = false;
              setMountedState(mountedRef.current);
            }
            if (onVisibilityChange) {
              onVisibilityChange(index, visibleRef.current, action);
            }
          }
        }
      };
      const observer = new IntersectionObserver(
        ([entry]) => {
          onCheckVisibility(entry);
        },
        { root, rootMargin: `${visibleOffset}px 0px ${visibleOffset}px 0px` }
      );
      observer.observe(wrapperEl);
      return (): void => {
        observer.disconnect();
      };
    }, [
      root,
      wrapperEl,
      visibleOffset,
      index,
      contentEl,
      mounted,
      onVisibilityChange,
    ]);

    const handleWrapperRef = useCallback(
      (instance: HTMLDivElement) => {
        if (instance) {
          setWrapperEl(instance);
          if (ref) {
            if (typeof ref === "function") {
              ref(instance);
            } else {
              ref.current = instance;
            }
          }
        }
      },
      [ref]
    );

    const handleContentRef = useCallback(
      (instance: HTMLDivElement) => {
        if (instance) {
          setContentEl(instance);
          if (contentRef) {
            if (typeof contentRef === "function") {
              contentRef(instance);
            } else {
              (contentRef as { current: HTMLDivElement }).current = instance;
            }
          }
        }
      },
      [contentRef]
    );

    const currentPlaceholderStyle: React.CSSProperties = useMemo(
      () => ({
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: "100%",
        ...placeholderStyle,
      }),
      [placeholderStyle]
    );

    return (
      <MeasuredBox
        className={["virtualized", mountedState ? "mounted" : "unmounted"].join(
          " "
        )}
        data-index={index}
        ref={handleWrapperRef}
        contentRef={handleContentRef}
        measureEl={measureEl}
        minHeight={minHeight}
        minValidHeight={minValidHeight}
        dontMeasure={!mountedState || dontMeasure}
        style={style}
        contentStyle={contentStyle}
        {...other}
      >
        {mountedState ? children : <div style={currentPlaceholderStyle} />}
      </MeasuredBox>
    );
  }
);

export default VirtualizedItem;
