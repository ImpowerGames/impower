import { PropsWithChildren, useEffect, useMemo, useRef } from "react";
import { SparkContext } from "../../../../spark-engine";
import { SparkGameApp } from "../../../../spark-pixi-app";

interface GameProps {
  domElementId: string;
  paused?: boolean;
  context?: SparkContext;
}

export const Game = (props: PropsWithChildren<GameProps>): JSX.Element => {
  const { paused, context, domElementId } = props;

  const elRef = useRef<HTMLDivElement>();
  const gameAppRef = useRef<SparkGameApp>();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (context) {
      elRef.current.style.transition = "none";
      elRef.current.style.opacity = "1";
    }
    if (gameAppRef.current) {
      gameAppRef.current.destroy(true);
    }
    if (context) {
      const onLoaded = (): void => {
        if (elRef.current) {
          elRef.current.style.transition = "opacity 0.5s ease";
          elRef.current.style.opacity = "0";
        }
      };
      gameAppRef.current = new SparkGameApp(domElementId, context, {
        startPaused: pausedRef.current,
        maxFPS: 60,
        onLoaded,
      });
    }
  }, [context, domElementId]);

  useEffect(() => {
    if (gameAppRef.current) {
      if (paused) {
        gameAppRef.current.pause();
      } else {
        gameAppRef.current.resume();
      }
    }
  }, [paused]);

  const style: React.CSSProperties = useMemo(
    () => ({
      pointerEvents: "none",
      backgroundColor: "black",
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
    []
  );

  return <div ref={elRef} style={style} />;
};

export default Game;
