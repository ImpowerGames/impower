import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { motion } from "framer-motion";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import format from "../../../impower-config/utils/format";
import { getDataDisplayValue } from "../../../impower-core";
import {
  GameProjectData,
  isReference,
  ItemType,
} from "../../../impower-game/data";
import { FontIcon } from "../../../impower-icon";
import { AccessibleEvent, ButtonShape } from "../../../impower-route";
import { GameContext } from "../../contexts/gameContext";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { DataButtonInfo } from "../../types/info/buttons";
import { getHeader } from "../../types/info/headers";
import { ItemPanelState } from "../../types/state/panelState";
import DataTypeInput from "../inputs/DataTypeInput";
import DataButton from "./DataButton";

const StyledExecutionBackground = styled(motion.div)``;

interface DataButtonLeftChildrenProps {
  id: string;
  index: number;
  targetContainerId: string;
  itemPanelState: ItemPanelState;
}

const DataButtonLeftChildren = React.memo(
  (props: DataButtonLeftChildrenProps): JSX.Element | null => {
    const { id, index, targetContainerId, itemPanelState } = props;

    const { game } = useContext(GameContext);

    const isCommandExecuting = useCallback((): boolean | undefined => {
      const blockState = game?.logic.state.blockStates[targetContainerId];
      if (!blockState) {
        return undefined;
      }
      return blockState.executingIndex === index;
    }, [game, targetContainerId, index]);

    const isTriggerSatisfied = useCallback((): boolean | undefined => {
      const blockState = game?.logic.state.blockStates[targetContainerId];
      if (!blockState) {
        return undefined;
      }
      if (blockState.satisfiedTriggers.includes(id)) {
        return true;
      }
      if (blockState.unsatisfiedTriggers.includes(id)) {
        return false;
      }
      return undefined;
    }, [game, targetContainerId, id]);

    const variableWasChanged = useCallback((): boolean | undefined => {
      const variableState = game?.logic.state.variableStates[id];
      if (variableState) {
        return true;
      }
      return undefined;
    }, [game, id]);

    const [executing, setExecuting] = useState(isCommandExecuting());
    const [triggerSatisfied, setTriggerSatisfied] = useState(
      isTriggerSatisfied()
    );
    const [variableChanged, setVariableChanged] = useState(
      variableWasChanged()
    );
    const executingTimeoutHandle = useRef(-1);

    useEffect(() => {
      const onStart = (): void => {
        if (executingTimeoutHandle.current >= 0) {
          clearTimeout(executingTimeoutHandle.current);
        }
        setExecuting(isCommandExecuting());
        setTriggerSatisfied(isTriggerSatisfied());
      };
      const onEnd = (): void => {
        if (executingTimeoutHandle.current >= 0) {
          clearTimeout(executingTimeoutHandle.current);
        }
        setExecuting(undefined);
        setTriggerSatisfied(undefined);
      };
      const onCheckTriggers = (data: { blockId: string }): void => {
        if (data.blockId === targetContainerId) {
          setTriggerSatisfied(isTriggerSatisfied());
        }
      };
      const onExecuteCommand = (data: {
        blockId: string;
        commandId: string;
      }): void => {
        if (data.blockId === targetContainerId) {
          if (data.commandId === id) {
            if (executingTimeoutHandle.current >= 0) {
              clearTimeout(executingTimeoutHandle.current);
            }
            setExecuting(isCommandExecuting());
          }
        }
      };
      const onFinishCommand = (data: {
        blockId: string;
        commandId: string;
      }): void => {
        if (data.blockId === targetContainerId) {
          if (data.commandId === id) {
            // Only hide execution icon if has not executed in the last 0.5 seconds
            executingTimeoutHandle.current = window.setTimeout(() => {
              setExecuting(false);
            }, 500);
          }
        }
      };
      const onSetVariableValue = (data: { id: string }): void => {
        if (data.id === id) {
          setVariableChanged(variableWasChanged());
        }
      };
      if (game) {
        game.events.onStart.addListener(onStart);
        game.events.onEnd.addListener(onEnd);
        game.logic.events.onCheckTriggers.addListener(onCheckTriggers);
        game.logic.events.onExecuteCommand.addListener(onExecuteCommand);
        game.logic.events.onFinishCommand.addListener(onFinishCommand);
        game.logic.events.onSetVariableValue.addListener(onSetVariableValue);
      }
      return (): void => {
        if (game) {
          game.events.onStart.removeListener(onStart);
          game.events.onEnd.removeListener(onEnd);
          game.logic.events.onCheckTriggers.removeListener(onCheckTriggers);
          game.logic.events.onExecuteCommand.removeListener(onExecuteCommand);
          game.logic.events.onFinishCommand.removeListener(onFinishCommand);
          game.logic.events.onSetVariableValue.removeListener(
            onSetVariableValue
          );
        }
      };
    }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

    const theme = useTheme();

    const showIcon =
      itemPanelState.section === "Command"
        ? executing
        : itemPanelState.section === "Trigger"
        ? triggerSatisfied === undefined
          ? undefined
          : true
        : itemPanelState.section === "Variable"
        ? variableChanged
        : undefined;

    const getTriggerIconColor = (s: boolean | undefined): string => {
      if (s === true) {
        return theme.colors.satisfied;
      }
      if (s === false) {
        return theme.colors.unsatisfied;
      }
      return theme.colors.black20;
    };

    const iconColor =
      itemPanelState.section === "Command"
        ? theme.colors.executed
        : itemPanelState.section === "Trigger"
        ? getTriggerIconColor(triggerSatisfied)
        : itemPanelState.section === "Variable"
        ? theme.colors.set
        : theme.colors.black50;

    const Icon = getHeader(itemPanelState.section)?.iconOn;

    return (
      <>
        {game !== undefined && showIcon !== undefined && (
          <StyledExecutionBackground
            className={StyledExecutionBackground.displayName}
            initial={false}
            animate={showIcon ? { opacity: 1 } : { opacity: 0 }}
            transition={{ type: "tween", duration: 0.3 }}
            style={{ color: iconColor }}
          >
            <FontIcon aria-label="Executing" size={14}>
              <Icon />
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
  itemPanelState: ItemPanelState;
  onClick?: (id: string) => void;
}

const DataButtonRightChildren = React.memo(
  (_props: DataButtonRightChildrenProps): JSX.Element | null => {
    // TODO: Display extra informational icons here
    return null;
  }
);

interface ItemButtonProps {
  buttonShape: ButtonShape;
  id: string;
  index: number;
  value: DataButtonInfo;
  currentOrderedIds: string[];
  currentSelectedIds: string[];
  currentDraggingIds: string[];
  currentGhostingIds: string[];
  changeTypeTargetId: string;
  targetContainerId: string;
  itemPanelState: ItemPanelState;
  disabled: boolean;
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
  onChangeType: (refId: string, refTypeId: string) => void;
  onDragHandleTrigger: (event: PointerEvent | React.PointerEvent) => void;
}

const ItemButton = React.memo((props: ItemButtonProps): JSX.Element => {
  const {
    buttonShape,
    id,
    index,
    value,
    currentOrderedIds,
    currentSelectedIds,
    currentDraggingIds,
    currentGhostingIds,
    changeTypeTargetId,
    targetContainerId,
    itemPanelState,
    disabled,
    onClick,
    onChangeSelection,
    onToggleSelection,
    onMultiSelection,
    onOpenContextMenu,
    onEdit,
    onChangeType,
    onDragHandleTrigger,
  } = props;

  const [state] = useContext(ProjectEngineContext);
  const { gameInspector } = useContext(GameInspectorContext);
  const { game } = useContext(GameContext);

  const { mode } = state.test;
  const project = state.project.data as GameProjectData;

  const headerInfo = useMemo(
    () => getHeader(itemPanelState.section),
    [itemPanelState.section]
  );

  const getVariableSummary = useCallback((): string | undefined => {
    const variableState = game?.logic.state.variableStates[id];
    if (variableState) {
      const lhsSummary = value.summary.split(" = ")[0];
      const rhs = variableState.value;
      const rhsSummary = isReference(rhs)
        ? gameInspector.getReferenceName(rhs, project)
        : getDataDisplayValue(rhs);
      return `${lhsSummary} = ${rhsSummary}`;
    }
    return undefined;
  }, [game, id, gameInspector, project, value.summary]);

  const [variableSummary, setVariableSummary] = useState<string | undefined>(
    getVariableSummary()
  );

  useEffect(() => {
    const onStart = (): void => {
      setVariableSummary(undefined);
    };
    const onEnd = (): void => {
      setVariableSummary(undefined);
    };
    const onSetVariableValue = (data: { id: string }): void => {
      if (data.id === id) {
        setVariableSummary(getVariableSummary());
      }
    };
    if (game) {
      game.events.onStart.addListener(onStart);
      game.events.onEnd.addListener(onEnd);
      game.logic.events.onSetVariableValue.addListener(onSetVariableValue);
    }
    return (): void => {
      if (game) {
        game.events.onStart.removeListener(onStart);
        game.events.onEnd.removeListener(onEnd);
        game.logic.events.onSetVariableValue.removeListener(onSetVariableValue);
      }
    };
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeChange = useCallback(
    (v: string) => {
      onChangeType(id, v);
    },
    [id, onChangeType]
  );

  const handleDragHandleTrigger = useCallback(
    (event: PointerEvent | React.PointerEvent) => {
      if (mode === "Test" || changeTypeTargetId) {
        return;
      }
      onDragHandleTrigger(event);
    },
    [mode, changeTypeTargetId, onDragHandleTrigger]
  );

  return (
    <DataButton
      shape={buttonShape}
      refId={id}
      refTypeId={value.refTypeId}
      name={value.name}
      summary={variableSummary !== undefined ? variableSummary : value.summary}
      icon={value.icon}
      iconColor={value.iconColor}
      textColor={value.textColor}
      hasChildren={value.hasChildren}
      allIds={currentOrderedIds}
      selectedIds={currentSelectedIds}
      draggingIds={currentDraggingIds}
      ghostingIds={currentGhostingIds}
      showInput={mode === "Edit" && changeTypeTargetId === id}
      disabled={disabled}
      grow
      onClick={onClick}
      onChangeSelection={onChangeSelection}
      onToggleSelection={onToggleSelection}
      onMultiSelection={onMultiSelection}
      onContextMenu={onOpenContextMenu}
      onDoubleClick={onEdit}
      onDragHandleTrigger={handleDragHandleTrigger}
      inputChildren={
        itemPanelState.section !== "Preview" ? (
          <DataTypeInput
            label={format("Add {target}", {
              target: headerInfo.name,
            })}
            refType={itemPanelState.section as ItemType}
            refTypeId={value.refTypeId}
            onChange={handleTypeChange}
          />
        ) : undefined
      }
      leftPaddingChildren={
        <DataButtonLeftChildren
          id={id}
          index={index}
          targetContainerId={targetContainerId}
          itemPanelState={itemPanelState}
        />
      }
      rightPaddingChildren={
        <DataButtonRightChildren
          id={id}
          hasChildren={value.hasChildren}
          itemPanelState={itemPanelState}
        />
      }
    />
  );
});

export default ItemButton;
