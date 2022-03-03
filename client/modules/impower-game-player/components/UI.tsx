import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ConstructData,
  FillType,
  UIElementData,
} from "../../impower-game/data";
import { PhaserGame } from "../types/game/phaserGame";
import { ConstructComponent } from "./ConstructComponent";

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

const UI = (props: UIProps): JSX.Element => {
  const { phaserGame } = props;

  const [loadedConstructs, setLoadedConstructs] = useState<ConstructData[]>(
    phaserGame.impowerGame
      ? phaserGame.impowerGame.entity.state.loadedConstructs.map(
          (id) => phaserGame.project?.instances?.constructs.data[id]
        )
      : []
  );

  const [measureEl, setMeasureEl] = useState<HTMLElement>();

  const overlayRef = useRef<HTMLDivElement>();
  const paddingRef = useRef<HTMLDivElement>();
  const widthRef = useRef<HTMLDivElement>();

  const impowerDataMap = useMemo(() => phaserGame.impowerDataMap, [phaserGame]);

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

  useEffect(() => {
    // Clear the loadedConstructs from previous game runs
    const onClearPreviousConstructs = (): void => {
      if (phaserGame.impowerGame) {
        setLoadedConstructs([]);
      }
    };

    const onChangeLoadedConstructs = (): void => {
      if (phaserGame.impowerGame) {
        setLoadedConstructs(
          phaserGame.impowerGame.entity.state.loadedConstructs.map(
            (id) => phaserGame.project?.instances?.constructs.data[id]
          )
        );
      }
    };

    const onSetElementImage = (data: {
      imageRefId: string;
      constructRefId: string;
      elementRefId: string;
    }): void => {
      const { elementRefId, constructRefId, imageRefId } = data;

      if (phaserGame.impowerGame) {
        const element =
          phaserGame.project?.instances?.constructs.data[constructRefId]
            .elements.data[elementRefId];

        const currentFill = (element as UIElementData).fill;
        const newFill = {
          ...currentFill,
          value: {
            ...currentFill.value,
            type: FillType.Image,
            image: {
              ...currentFill.value.image,
              refId: imageRefId,
            },
          },
        };
        const newConstruct = {
          ...phaserGame.project?.instances?.constructs.data[constructRefId],
          elements: {
            ...phaserGame.project?.instances?.constructs.data[constructRefId]
              .elements,
            data: {
              [elementRefId]: {
                ...phaserGame.project?.instances?.constructs.data[
                  constructRefId
                ].elements.data[elementRefId],
                fill: newFill,
              },
            },
          },
        };

        setLoadedConstructs([newConstruct]);
      }
    };

    if (phaserGame.impowerGame) {
      phaserGame.impowerGame.entity.events.onLoadConstruct.addListener(
        onChangeLoadedConstructs
      );
      phaserGame.impowerGame.entity.events.onSetElementImage.addListener(
        onSetElementImage
      );
      phaserGame.impowerGame.entity.events.onUnloadConstruct.addListener(
        onChangeLoadedConstructs
      );
      phaserGame.impowerGame.entity.events.onClearPreviousConstructs.addListener(
        onClearPreviousConstructs
      );
    }
    return (): void => {
      if (phaserGame.impowerGame) {
        phaserGame.impowerGame.entity.events.onLoadConstruct.removeListener(
          onChangeLoadedConstructs
        );
        phaserGame.impowerGame.entity.events.onSetElementImage.removeListener(
          onSetElementImage
        );
        phaserGame.impowerGame.entity.events.onUnloadConstruct.removeListener(
          onChangeLoadedConstructs
        );
        phaserGame.impowerGame.entity.events.onClearPreviousConstructs.removeListener(
          onClearPreviousConstructs
        );
      }
    };
  });

  const handleRef = useCallback((instance: HTMLElement) => {
    if (instance) {
      setMeasureEl(instance);
    }
  }, []);

  return (
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
        ref={overlayRef}
        id="ui-overlay"
        style={{ ...phaserGame.getUIStyle() }}
      >
        {Object.values(loadedConstructs).map(
          (construct) =>
            phaserGame.impowerGame && (
              <ConstructComponent
                key={construct?.reference?.refId}
                construct={construct}
                variables={impowerDataMap?.variables}
                constructs={impowerDataMap?.constructs}
                files={impowerDataMap?.files}
                game={phaserGame.impowerGame}
              />
            )
        )}
        <div
          id="impower-ui-display"
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
            }}
          />
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
                  className="dialogue-group"
                  style={{
                    width: "90%",
                    margin: "0 auto",
                    flex: 1,
                  }}
                >
                  <div className="character" style={{ textAlign: "center" }} />
                  <div
                    className="parenthetical"
                    style={{ textAlign: "center" }}
                  />
                  <div className="dialogue" />
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UI;
