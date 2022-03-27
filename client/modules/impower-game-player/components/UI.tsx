import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PhaserGame } from "../types/game/phaserGame";

const responsiveBreakpoints: number[] = [400, 600, 960, 1280, 1920];
const responsiveBaseFontSizes: Record<number, string> = {
  400: "16px",
  600: "16px",
  960: "18px",
  1280: "18px",
  1920: "18px",
};
const responsivePadding: Record<number, string> = {
  400: "16px",
  600: "16px",
  960: "32px",
  1280: "32px",
  1920: "32px",
};
const responsiveWidth: Record<number, string> = {
  400: "90%",
  600: "90%",
  960: "80%",
  1280: "70%",
  1920: "70%",
};

interface UIProps {
  phaserGame: PhaserGame;
}

const UI = React.memo((props: UIProps): JSX.Element => {
  const { phaserGame } = props;

  const [measureEl, setMeasureEl] = useState<HTMLElement>();

  const overlayRef = useRef<HTMLDivElement>();
  const paddingRef = useRef<HTMLDivElement>();
  const widthRef = useRef<HTMLDivElement>();

  useEffect(() => {
    if (!measureEl) {
      return (): void => null;
    }
    const onResize = (entry: ResizeObserverEntry): void => {
      if (entry) {
        const width = entry.contentRect?.width;
        const breakpoint = responsiveBreakpoints.find((x) => x > width);
        if (overlayRef.current) {
          const baseFontSize = responsiveBaseFontSizes[breakpoint];
          overlayRef.current.style.fontSize = baseFontSize;
        }
        if (paddingRef.current) {
          const padding = responsivePadding[breakpoint];
          paddingRef.current.style.padding = padding;
        }
        if (widthRef.current) {
          const width = responsiveWidth[breakpoint];
          widthRef.current.style.width = width;
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

  const choiceStyle: React.CSSProperties = useMemo(
    () => ({
      pointerEvents: "auto",
      margin: 8,
      width: 600,
      maxWidth: "100%",
      fontFamily: "Courier Prime Sans",
      fontSize: "1em",
      display: "none",
    }),
    []
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
            id="impower_ui"
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
          >
            <div
              className="portrait"
              style={{
                position: "absolute",
                top: "10%",
                right: 0,
                bottom: "10%",
                left: 0,
                display: "flex",
                flexDirection: "column",
              }}
            />
            <div
              style={{
                position: "relative",
                flex: 7,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
              }}
            >
              <button className="choice" style={choiceStyle}></button>
              <button className="choice" style={choiceStyle}></button>
              <button className="choice" style={choiceStyle}></button>
              <button className="choice" style={choiceStyle}></button>
              <button className="choice" style={choiceStyle}></button>
            </div>
            <div
              style={{
                position: "relative",
                flex: 3,
                display: "flex",
                flexDirection: "column",
                backgroundColor: "white",
                boxShadow: "0 -2px 4px 0 #00000080",
              }}
            >
              <div
                ref={paddingRef}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignContent: "center",
                  maxWidth: 600,
                  width: "100%",
                  margin: "0 auto",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    fontFamily: "Courier Prime Sans",
                    fontSize: "1em",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div
                    ref={widthRef}
                    className="dialogue_group"
                    style={{
                      width: "90%",
                      margin: "0 auto",
                      flex: 1,
                    }}
                  >
                    <div
                      className="character"
                      style={{ textAlign: "center" }}
                    />
                    <div
                      className="parenthetical"
                      style={{ textAlign: "center" }}
                    />
                    <div className="dialogue" style={{ flex: 1 }} />
                  </div>
                  <div className="action" style={{ flex: 1 }} />
                  <div className="centered" style={{ textAlign: "center" }} />
                  <div className="transition" style={{ textAlign: "right" }} />
                  <div
                    className="scene"
                    style={{
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div
                      className="indicator"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: "8px solid transparent",
                        borderRight: "8px solid transparent",
                        borderTop: "8px solid #315881",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export default UI;
