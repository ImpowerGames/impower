import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface MeasuredBoxProps
  extends React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  > {
  contentRef?: React.Ref<HTMLDivElement>;
  measureEl?: HTMLElement;
  minHeight?: number;
  minValidHeight?: number;
  dontMeasure?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
}

const MeasuredBox = React.forwardRef(
  (props: MeasuredBoxProps, ref): JSX.Element => {
    const [wrapperEl, setWrapperEl] = useState<HTMLDivElement>();
    const [contentEl, setContentEl] = useState<HTMLDivElement>();

    const {
      contentRef,
      measureEl = contentEl,
      minHeight,
      minValidHeight = 1,
      dontMeasure,
      style,
      contentStyle,
      children,
      ...other
    } = props;

    const wrapperElRef = useRef(wrapperEl);
    const contentElRef = useRef(contentEl);
    const dontMeasureRef = useRef(dontMeasure);

    wrapperElRef.current = wrapperEl;
    contentElRef.current = contentEl;
    dontMeasureRef.current = dontMeasure;

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

    useEffect(() => {
      if (!wrapperEl || !contentEl || !measureEl) {
        return (): void => null;
      }
      const onResize = (entry: ResizeObserverEntry): void => {
        if (entry && !dontMeasureRef.current) {
          const size = entry.contentRect.height;
          if (size > minValidHeight) {
            if (wrapperEl) {
              wrapperEl.style.minHeight = `${size}px`;
              wrapperEl.style.contain = "size layout style";
            }
            if (contentEl) {
              contentEl.style.position = `absolute`;
            }
          }
        }
      };
      const resizeObserver = new ResizeObserver(([entry]) => {
        onResize(entry);
      });
      resizeObserver.observe(measureEl);
      return (): void => {
        resizeObserver.disconnect();
      };
    }, [wrapperEl, minValidHeight, contentEl, measureEl]);

    useEffect(() => {
      if (!wrapperEl || !contentEl || !measureEl) {
        return;
      }
      const size = measureEl.offsetHeight;
      if (size > minValidHeight) {
        if (wrapperEl) {
          wrapperEl.style.minHeight = `${size}px`;
          wrapperEl.style.contain = "size layout style";
        }
        if (contentEl) {
          contentEl.style.position = `absolute`;
        }
      }
    }, [contentEl, measureEl, minValidHeight, wrapperEl]);

    const currentStyle: React.CSSProperties = useMemo(
      () => ({
        minHeight,
        position: "relative",
        width: "100%",
        ...style,
      }),
      [minHeight, style]
    );

    const currentContentStyle: React.CSSProperties = useMemo(
      () => ({
        position: "static",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: "fit-content",
        ...contentStyle,
      }),
      [contentStyle]
    );

    return (
      <div ref={handleWrapperRef} style={currentStyle} {...other}>
        <div
          className={"measured-content"}
          ref={handleContentRef}
          style={currentContentStyle}
        >
          {children}
        </div>
      </div>
    );
  }
);

export default MeasuredBox;
