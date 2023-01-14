import CircularProgress from "@mui/material/CircularProgress";
import dynamic from "next/dynamic";
import { PropsWithChildren } from "react";
import { SparkContext } from "../../../../spark-engine";

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
