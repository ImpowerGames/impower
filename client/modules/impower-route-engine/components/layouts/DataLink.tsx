import { useTheme } from "@emotion/react";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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

  const context = useContext(GameContext);

  const theme = useTheme();

  const isExecuting = useCallback((): boolean | undefined => {
    const blockState = context?.game?.logic.state.blockStates[toNodeId];
    if (!blockState) {
      return undefined;
    }
    return blockState.isExecuting && blockState.executedBy === fromNodeId;
  }, [context, toNodeId, fromNodeId]);

  const [executing, setExecuting] = useState(isExecuting());
  const executingTimeoutHandle = useRef(-1);

  useEffect(() => {
    const onStart = (): void => {
      if (executingTimeoutHandle.current >= 0) {
        clearTimeout(executingTimeoutHandle.current);
      }
      setExecuting(isExecuting());
    };
    const onDestroy = (): void => {
      if (executingTimeoutHandle.current >= 0) {
        clearTimeout(executingTimeoutHandle.current);
      }
      setExecuting(undefined);
    };
    const onExecuteBlock = (data: {
      blockId: string;
      executedByBlockId: string;
    }): void => {
      if (data.blockId === toNodeId && data.executedByBlockId === fromNodeId) {
        if (executingTimeoutHandle.current >= 0) {
          clearTimeout(executingTimeoutHandle.current);
        }
        setExecuting(isExecuting());
      }
    };
    const onFinishBlock = (data: {
      blockId: string;
      executedByBlockId: string;
    }): void => {
      if (data.blockId === toNodeId && data.executedByBlockId === fromNodeId) {
        // Only hide execution icon if has not executed in the last 0.5 seconds
        executingTimeoutHandle.current = window.setTimeout(() => {
          setExecuting(false);
        }, 500);
      }
    };
    if (context?.game) {
      context?.game.events.onStart.addListener(onStart);
      context?.game.events.onDestroy.addListener(onDestroy);
      context?.game.logic.events.onExecuteBlock.addListener(onExecuteBlock);
      context?.game.logic.events.onFinishBlock.addListener(onFinishBlock);
    }
    return (): void => {
      if (context?.game) {
        context?.game.events.onStart.removeListener(onStart);
        context?.game.events.onDestroy.removeListener(onDestroy);
        context?.game.logic.events.onExecuteBlock.removeListener(
          onExecuteBlock
        );
        context?.game.logic.events.onFinishBlock.removeListener(onFinishBlock);
      }
    };
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps

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
