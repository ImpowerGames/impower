import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getRootElementId } from "../../impower-game/dom";
import { PhaserGame } from "../types/game/phaserGame";

const responsiveBreakpoints: Record<string, number> = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

interface UIProps {
  phaserGame: PhaserGame;
}

const UI = React.memo((props: UIProps): JSX.Element => {
  const { phaserGame } = props;

  const [measureEl, setMeasureEl] = useState<HTMLElement>();

  const overlayRef = useRef<HTMLDivElement>();

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
        if (overlayRef.current.className !== className) {
          overlayRef.current.className = className;
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

  useEffect(() => {
    if (phaserGame) {
      const onResize = (): void => {
        if (phaserGame.canvas) {
          if (overlayRef.current) {
            overlayRef.current.style.width = phaserGame.canvas.style.width;
            overlayRef.current.style.height = phaserGame.canvas.style.height;
            overlayRef.current.style.marginLeft =
              phaserGame.canvas.style.marginLeft;
            overlayRef.current.style.marginTop =
              phaserGame.canvas.style.marginTop;
          }
        }
      };

      onResize();
      phaserGame.scale.addListener("resize", onResize, {
        passive: true,
      });
      return (): void => {
        phaserGame.scale.removeListener("resize", onResize);
      };
    }
    return undefined;
  }, [phaserGame]);

  const handleRef = useCallback((instance: HTMLElement) => {
    if (instance) {
      setMeasureEl(instance);
    }
  }, []);

  const overlayStyle: React.CSSProperties = useMemo(
    () => ({ ...(phaserGame?.getUIStyle() || {}) }),
    [phaserGame]
  );

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
        <div ref={overlayRef} id="ui-overlay" style={overlayStyle}>
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
              backgroundColor: "white",
            }}
          />
        </div>
      </div>
    </>
  );
});

export default UI;
