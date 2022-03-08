import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { motion } from "framer-motion";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AngleRightSolidIcon from "../../../../resources/icons/solid/angle-right.svg";
import BoltSolidIcon from "../../../../resources/icons/solid/bolt.svg";
import WandMagicSparklesSolidIcon from "../../../../resources/icons/solid/wand-magic-sparkles.svg";
import { FontIcon } from "../../../impower-icon";
import {
  AccessibleEvent,
  ButtonShape,
  onTapButton,
} from "../../../impower-route";
import DataNameInput from "../../../impower-route/components/inputs/DataNameInput";
import { GameContext } from "../../contexts/gameContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { DataButtonInfo } from "../../types/info/buttons";
import PanelHeaderIconButton from "../iconButtons/PanelHeaderIconButton";
import DataButton from "./DataButton";

const StyledExecutionBackground = styled(motion.div)`
  color: ${(props): string => props.theme.colors.executed};
`;

interface DataButtonLeftChildrenProps {
  id: string;
}

const DataButtonLeftChildren = React.memo(
  (props: DataButtonLeftChildrenProps): JSX.Element | null => {
    const { id } = props;

    const { game } = useContext(GameContext);

    const isBlockExecuting = useCallback((): boolean | undefined => {
      const blockState = game?.logic.state.blockStates[id];
      if (!blockState) {
        return undefined;
      }
      return blockState.isExecuting;
    }, [game, id]);
    const getExecutedByCommandId = useCallback((): string | undefined => {
      const blockState = game?.logic.state.blockStates[id];
      if (!blockState) {
        return undefined;
      }
      return blockState.executedBy;
    }, [game, id]);

    const [executing, setExecuting] = useState(isBlockExecuting());
    const [executedByBlockId, setExecutedByBlockId] = useState(
      getExecutedByCommandId
    );
    const executingTimeoutHandle = useRef(-1);

    useEffect(() => {
      const onStart = (): void => {
        if (executingTimeoutHandle.current >= 0) {
          clearTimeout(executingTimeoutHandle.current);
        }
        setExecuting(isBlockExecuting());
        setExecutedByBlockId(getExecutedByCommandId());
      };
      const onEnd = (): void => {
        if (executingTimeoutHandle.current >= 0) {
          clearTimeout(executingTimeoutHandle.current);
        }
        setExecuting(undefined);
        setExecutedByBlockId(undefined);
      };
      const onExecuteBlock = (data: { id: string }): void => {
        if (data.id === id) {
          if (executingTimeoutHandle.current >= 0) {
            clearTimeout(executingTimeoutHandle.current);
          }
          setExecuting(isBlockExecuting());
          setExecutedByBlockId(getExecutedByCommandId());
        }
      };
      const onFinishBlock = (data: { id: string }): void => {
        if (data.id === id) {
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
      <>
        {game !== undefined && executing !== undefined && (
          <StyledExecutionBackground
            className={StyledExecutionBackground.displayName}
            initial={false}
            animate={executing ? { opacity: 1 } : { opacity: 0 }}
            transition={{ type: "tween", duration: 0.3 }}
          >
            <FontIcon aria-label="Executing" size={14}>
              {executedByBlockId ? (
                <WandMagicSparklesSolidIcon />
              ) : (
                <BoltSolidIcon />
              )}
            </FontIcon>
          </StyledExecutionBackground>
        )}
      </>
    );
  }
);

interface DataButtonRightChildrenProps {
  id: string;
  hasChildren: boolean;
  draggingIds: string[];
  onClick: (e: React.MouseEvent, id: string) => void;
}

const DataButtonRightChildren = React.memo(
  (props: DataButtonRightChildrenProps): JSX.Element | null => {
    const { id, hasChildren, draggingIds, onClick } = props;

    const dragging = draggingIds.includes(id);

    const theme = useTheme();

    return (
      <PanelHeaderIconButton
        {...onTapButton(true, dragging, (e) => onClick(e, id))}
        onPointerDown={(e): void => {
          e.stopPropagation();
        }}
        color={`${theme.colors.subtitle}${hasChildren ? "FF" : "40"}`}
        aria-label="Open"
        icon={<AngleRightSolidIcon />}
        size={theme.fontSize.smallIcon}
        disableTooltipTouchListener
      />
    );
  }
);

interface ContainerButtonProps {
  buttonShape: ButtonShape;
  id: string;
  value: DataButtonInfo;
  currentOrderedIds: string[];
  currentSelectedIds: string[];
  currentDraggingIds: string[];
  currentGhostingIds: string[];
  changeNameTargetId: string;
  grow?: boolean;
  onBreadcrumb: (
    e: React.MouseEvent | React.ChangeEvent,
    refId: string
  ) => void;
  onClick?: (refId: string, event: React.MouseEvent) => void;
  onChangeSelection: (refId: string, event: AccessibleEvent) => void;
  onToggleSelection: (refId: string, event: AccessibleEvent) => void;
  onMultiSelection: (
    refId: string,
    allIds: string[],
    event: AccessibleEvent
  ) => void;
  onOpenContextMenu: (event: AccessibleEvent) => void;
  onEdit: (refId: string, event: AccessibleEvent) => void;
  onChangeName: (refId: string, name: string) => void;
  onDragHandleTrigger?: (event: PointerEvent | React.PointerEvent) => void;
}

const ContainerButton = React.memo(
  (props: ContainerButtonProps): JSX.Element => {
    const {
      buttonShape,
      id,
      value,
      currentOrderedIds,
      currentSelectedIds,
      currentDraggingIds,
      currentGhostingIds,
      changeNameTargetId,
      grow,
      onBreadcrumb,
      onClick,
      onChangeSelection,
      onToggleSelection,
      onMultiSelection,
      onOpenContextMenu,
      onEdit,
      onChangeName,
      onDragHandleTrigger,
    } = props;

    const [state] = useContext(ProjectEngineContext);

    const { mode } = state.test;

    const handleNameBlur = useCallback(
      (e: React.FocusEvent, v: string) => {
        onChangeName(id, v);
      },
      [id, onChangeName]
    );

    const handleDragHandleTrigger = useCallback(
      (event: PointerEvent | React.PointerEvent) => {
        if (mode === "Test" || changeNameTargetId) {
          return;
        }
        onDragHandleTrigger?.(event);
      },
      [mode, changeNameTargetId, onDragHandleTrigger]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent, id: string) => {
        if (onBreadcrumb) {
          onBreadcrumb(e, id);
        }
      },
      [onBreadcrumb]
    );

    return (
      <DataButton
        shape={buttonShape}
        refId={id}
        refTypeId={value.refTypeId}
        name={value.name}
        summary={value.summary}
        icon={value.icon}
        iconColor={value.iconColor}
        textColor={value.textColor}
        hasChildren={value.hasChildren}
        allIds={currentOrderedIds}
        selectedIds={currentSelectedIds}
        draggingIds={currentDraggingIds}
        ghostingIds={currentGhostingIds}
        disabled={false}
        showInput={mode === "Edit" && changeNameTargetId === id}
        grow={grow}
        onClick={onClick}
        onChangeSelection={onChangeSelection}
        onToggleSelection={onToggleSelection}
        onMultiSelection={onMultiSelection}
        onContextMenu={onOpenContextMenu}
        onDoubleClick={onEdit}
        onDragHandleTrigger={handleDragHandleTrigger}
        inputChildren={
          <DataNameInput name={value.name} onBlur={handleNameBlur} />
        }
        leftPaddingChildren={<DataButtonLeftChildren id={id} />}
        rightPaddingChildren={
          <DataButtonRightChildren
            id={id}
            hasChildren={value.hasChildren}
            draggingIds={currentDraggingIds}
            onClick={handleClick}
          />
        }
      />
    );
  }
);

export default ContainerButton;
