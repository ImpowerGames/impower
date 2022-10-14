import { PropsWithChildren, useEffect, useMemo, useRef } from "react";
import { SparkContext } from "../../../../spark-engine";
import { GameApp } from "../../../../spark-pixi-app";

interface GameProps {
  domElementId: string;
  paused?: boolean;
  context?: SparkContext;
}

export const Game = (props: PropsWithChildren<GameProps>): JSX.Element => {
  const { paused, context, domElementId } = props;

  const elRef = useRef<HTMLDivElement>();
  const gameAppRef = useRef<GameApp>();
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
      gameAppRef.current = new GameApp(domElementId, context, {
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

  useEffect(() => {
    const onFocus = (): void => {
      if (!pausedRef.current && !gameAppRef.current.sparkContext.editable) {
        gameAppRef.current.resume();
      }
    };
    const onBlur = (): void => {
      gameAppRef.current.pause();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    // Specify how to clean up after this effect:
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

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
