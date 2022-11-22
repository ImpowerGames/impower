import CircularProgress from "@mui/material/CircularProgress";
import dynamic from "next/dynamic";
import { PropsWithChildren, useEffect } from "react";
import { SparkContext } from "../../../../spark-engine";

export const responsiveBreakpoints: Record<string, number> = {
  xs: 400,
  sm: 600,
  md: 960,
  lg: 1280,
  xl: 1920,
};

const DOM_ID = "game";

const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress size={24} color="inherit" disableShrink />
    </div>
  ),
});

interface PlayerProps {
  paused?: boolean;
  context?: SparkContext;
}

export const Player = (props: PropsWithChildren<PlayerProps>): JSX.Element => {
  const { children, context, ...other } = props;

  useEffect(() => {
    const parent = document.getElementById(DOM_ID);
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        const width = entry.contentRect?.width;
        const keys = Object.keys(responsiveBreakpoints);
        let className = "";
        for (let i = 0; i < keys.length; i += 1) {
          const k = keys[i] || "";
          className += `${k} `;
          const b = responsiveBreakpoints[k];
          if (b !== undefined) {
            if (b > width) {
              break;
            }
          }
        }
        className = className.trim();
        if (
          entry.target.parentElement &&
          entry.target.parentElement.className !== className
        ) {
          entry.target.parentElement.className = className;
        }
      }
    });
    resizeObserver.observe(parent);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        color: "white",
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      }}
    >
      <div
        style={{
          color: "black",
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      >
        <div
          id={DOM_ID}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: "black",
          }}
        />
        <div
          id="spark-overlay"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        >
          <div
            id="spark-root"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              display: "flex",
              flexDirection: "column",
              pointerEvents: "none",
            }}
          />
        </div>
        {children}
      </div>
      {context && <Game domElementId={DOM_ID} context={context} {...other} />}
    </div>
  );
};
