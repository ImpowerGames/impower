import React, { useCallback, useEffect, useRef, useState } from "react";
import { getRootElementId } from "../../../../spark-engine";

const responsiveBreakpoints: Record<string, number> = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

const UI = React.memo((): JSX.Element => {
  const [measureEl, setMeasureEl] = useState<HTMLElement>();

  const uiRef = useRef<HTMLElement>();

  useEffect(() => {
    if (!measureEl) {
      return (): void => null;
    }
    const onResize = (entry: ResizeObserverEntry): void => {
      if (entry) {
        const width = entry.contentRect?.width;
        const keys = Object.keys(responsiveBreakpoints);
        let className = "";
        for (let i = 0; i < keys.length; i += 1) {
          const k = keys[i];
          className += `${k} `;
          if (responsiveBreakpoints[k] > width) {
            break;
          }
        }
        className = className.trim();
        if (uiRef.current.className !== className) {
          uiRef.current.className = className;
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
  }, [measureEl]);

  const handleRef = useCallback((instance: HTMLElement) => {
    uiRef.current = instance;
    if (instance) {
      setMeasureEl(instance);
    }
  }, []);

  return (
    <>
      <div
        ref={handleRef}
        id="ui"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          pointerEvents: "none",
        }}
      >
        <div
          id={getRootElementId()}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: "flex",
            flexDirection: "column",
          }}
        />
      </div>
    </>
  );
});

export default UI;
