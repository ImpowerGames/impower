import { PropsWithChildren, useEffect, useRef } from "react";
import { SparkContext } from "../../../../spark-engine";
import { GameApp } from "../../../../spark-pixi-app";

interface GameProps {
  domElementId: string;
  paused?: boolean;
  context?: SparkContext;
}

export const Game = (props: PropsWithChildren<GameProps>): JSX.Element => {
  const { paused, context, domElementId } = props;

  const gameAppRef = useRef<GameApp>();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (gameAppRef.current) {
      gameAppRef.current.destroy(true);
    }
    if (context) {
      gameAppRef.current = new GameApp(
        domElementId,
        context,
        pausedRef.current
      );
    }
  }, [context, domElementId]);

  useEffect(() => {
    if (gameAppRef.current) {
      if (paused) {
        gameAppRef.current.resume();
      } else {
        gameAppRef.current.pause();
      }
    }
  }, [paused]);

  return null;
};

export default Game;
