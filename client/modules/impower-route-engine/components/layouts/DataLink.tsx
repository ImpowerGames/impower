import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
} from "react";

import { useTheme } from "@emotion/react";
import {
  LinkDefault,
  LinkDefaultProps,
} from "../../../impower-react-flowchart";
import { GameContext } from "../../contexts/gameContext";

export const DataLink = React.memo((props: LinkDefaultProps): JSX.Element => {
  const {
    fromNodeId,
    toNodeId,
    startPosition,
    endPosition,
    startSide,
    endSide,
    linkColor,
    lineStrokeWidth,
    arrowSize,
    arrowStrokeWidth,
  } = props;

  const { game } = useContext(GameContext);

  const theme = useTheme();

  const isExecuting = useCallback((): boolean | undefined => {
    const blockState = game?.logic.state.blockStates[toNodeId];
    if (!blockState) {
      return undefined;
    }
    return (
      blockState.isExecuting && blockState.executedByBlockId === fromNodeId
    );
  }, [game, toNodeId, fromNodeId]);

  const [executing, setExecuting] = useState(isExecuting());
  const executingTimeoutHandle = useRef(-1);

  useEffect(() => {
    const onStart = (): void => {
      if (executingTimeoutHandle.current >= 0) {
        clearTimeout(executingTimeoutHandle.current);
      }
      setExecuting(isExecuting());
    };
    const onEnd = (): void => {
      if (executingTimeoutHandle.current >= 0) {
        clearTimeout(executingTimeoutHandle.current);
      }
      setExecuting(undefined);
    };
    const onExecuteBlock = (data: {
      id: string;
      executedByBlockId: string;
    }): void => {
      if (data.id === toNodeId && data.executedByBlockId === fromNodeId) {
        if (executingTimeoutHandle.current >= 0) {
          clearTimeout(executingTimeoutHandle.current);
        }
        setExecuting(isExecuting());
      }
    };
    const onFinishBlock = (data: {
      id: string;
      executedByBlockId: string;
    }): void => {
      if (data.id === toNodeId && data.executedByBlockId === fromNodeId) {
        // Only hide execution icon if has not executed in the last 0.5 seconds
        executingTimeoutHandle.current = window.setTimeout(() => {
          setExecuting(false);
        }, 500);
      }
    };
    if (game) {
      game.events.onStart.addListener(onStart);
      game.events.onEnd.addListener(onEnd);
      game.logic.events.onExecuteBlock.addListener(onExecuteBlock);
      game.logic.events.onFinishBlock.addListener(onFinishBlock);
    }
    return (): void => {
      if (game) {
        game.events.onStart.removeListener(onStart);
        game.events.onEnd.removeListener(onEnd);
        game.logic.events.onExecuteBlock.removeListener(onExecuteBlock);
        game.logic.events.onFinishBlock.removeListener(onFinishBlock);
      }
    };
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LinkDefault
      fromNodeId={fromNodeId}
      toNodeId={toNodeId}
      startPosition={startPosition}
      endPosition={endPosition}
      startSide={startSide}
      endSide={endSide}
      linkColor={executing ? theme.colors.executed : linkColor}
      lineStrokeWidth={lineStrokeWidth}
      arrowSize={arrowSize}
      arrowStrokeWidth={arrowStrokeWidth}
    />
  );
});
