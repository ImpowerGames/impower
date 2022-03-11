import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import CheckSolidIcon from "../../../../resources/icons/solid/check.svg";
import { FontIcon } from "../../../impower-icon";
import {
  AccessibleEvent,
  ButtonShape,
  onTapSelectButton,
  onTapSelectToggle,
} from "../../../impower-route";
import { DataButtonInfo } from "../../types/info/buttons";

const isMultiDragging = (dragging: boolean, ghostingCount: number): boolean => {
  return dragging && ghostingCount > 0;
};

const StyledBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  min-width: ${(props): string => props.theme.minWidth.dataButton};
  user-select: none;
  touch-callout: none;
`;

const StyledBackgroundIconButton = styled(Button)<{
  component?: string;
  shape: ButtonShape;
}>`
  text-transform: none;
  position: relative;
  padding: 0;
  display: flex;
  border-radius: ${(props): string =>
    props.shape === ButtonShape.Pill
      ? props.theme.borderRadius.pill
      : props.theme.borderRadius.box};
  background-color: transparent;
  user-select: none;
  touch-callout: none;

  &::before {
    content: "";
    position: absolute;
    top: -${(props): string => props.theme.spacing(props.theme.space.reorderableTop)};
    bottom: -${(props): string => props.theme.spacing(props.theme.space.reorderableBottom)};
    left: 0;
    right: 0;
  }
`;

const StyledToggleIconButton = styled(StyledBackgroundIconButton)`
  min-width: ${(props): string => props.theme.minWidth.dataButton};
  user-select: none;
  touch-callout: none;
`;

const StyledIconText = styled.div`
  min-height: ${(props): string => props.theme.minHeight.dataButton};

  color: white;

  display: flex;
  min-width: ${(props): string => props.theme.minWidth.dataButton};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  font-size: ${(props): string => props.theme.fontSize.regular};

  align-items: center;
  justify-content: center;
  white-space: nowrap;
  user-select: none;
  touch-callout: none;
`;

const StyledToggleBackground = styled(StyledBackground)<{
  shape: ButtonShape;
  multidragging: boolean;
  selected: boolean;
  iconcolor: string;
}>`
  width: ${(props): string => props.theme.minWidth.dataButton};
  background-color: ${(props): string =>
    props.selected ? props.theme.colors.selected : props.iconcolor};

  border-radius: ${(props): string =>
    props.shape === ButtonShape.Pill
      ? props.theme.borderRadius.pill
      : props.theme.borderRadius.box};
  user-select: none;
  touch-callout: none;
`;

interface ToggleButtonProps {
  icon: React.ReactNode;
  shape: ButtonShape;
  ghostingCount: number;
  dragging: boolean;
  selected: boolean;
  onToggleSelection: (event: AccessibleEvent) => void;
  onMultiSelection: (event: AccessibleEvent) => void;
  onDragHandleTrigger?: (event: PointerEvent | React.PointerEvent) => void;
}

const ToggleButton = React.memo((props: ToggleButtonProps): JSX.Element => {
  const {
    icon,
    shape,
    ghostingCount,
    dragging,
    selected,
    onToggleSelection,
    onMultiSelection,
    onDragHandleTrigger,
  } = props;

  const multiDragging = useMemo(
    () => isMultiDragging(dragging, ghostingCount),
    [dragging, ghostingCount]
  );

  const theme = useTheme();

  return (
    <StyledToggleIconButton
      component="div"
      className={StyledToggleIconButton.displayName}
      onPointerDown={(e): void => {
        if (onDragHandleTrigger) {
          onDragHandleTrigger(e);
        }
      }}
      {...onTapSelectToggle(
        false,
        dragging,
        selected,
        (e) => onToggleSelection(e),
        (e) => onMultiSelection(e)
      )}
      shape={shape}
    >
      <StyledIconText className={StyledIconText.displayName}>
        {multiDragging ? (
          `${ghostingCount + 1}`
        ) : (
          <FontIcon
            aria-label={selected ? "Deselect" : "Select"}
            size={theme.fontSize.regular}
          >
            {selected ? <CheckSolidIcon /> : icon}
          </FontIcon>
        )}
      </StyledIconText>
    </StyledToggleIconButton>
  );
});

const StyledBarIconButton = styled(StyledBackgroundIconButton)`
  min-width: 0;
  flex: 1;
  padding-right: ${(props): string =>
    props.theme.spacing(props.theme.space.reorderableContentRight)};
  padding-left: ${(props): string =>
    props.theme.spacing(props.theme.space.reorderableContentLeft)};
  user-select: none;
  touch-callout: none;
`;

const StyledBar = styled.div`
  min-height: ${(props): string => props.theme.minHeight.dataButton};
  display: flex;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
  user-select: none;
  touch-callout: none;
`;

const StyledName = styled.div<{ selected: boolean }>`
  color: ${(props): string =>
    props.selected
      ? props.theme.colors.selectedDark
      : props.theme.colors.darkText};
  font-size: ${(props): string => props.theme.fontSize.regular};
  font-family: ${(props): string => props.theme.typography.fontFamily};
  line-height: ${(props): React.ReactText =>
    props.theme.typography.body1.lineHeight};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  letter-spacing: 0;
  display: inline-flex;
  flex: 1 1 auto;
  margin: auto;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  min-height: ${(props): string => props.theme.minHeight.dataButton};
  display: flex;
  align-items: center;

  padding-right: ${(props): string =>
    props.theme.spacing(props.theme.space.reorderableText)};
  user-select: none;
  touch-callout: none;
`;

const StyledSummary = styled.div<{ selected: boolean }>`
  color: ${(props): string =>
    props.selected
      ? props.theme.colors.selectedLight
      : props.theme.colors.lightText};
  font-size: ${(props): string => props.theme.fontSize.regular};
  font-weight: ${(props): React.ReactText =>
    props.theme.typography.body1.fontWeight};
  line-height: ${(props): React.ReactText =>
    props.theme.typography.body1.lineHeight};

  flex: 0 1000 auto;
  margin: auto;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  user-select: none;
  touch-callout: none;
`;

const StyledUnselectableText = styled(Typography)`
  user-select: none;
  touch-callout: none;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
`;

interface BarButtonProps {
  refId: string;
  name: string;
  summary: string;
  shape: ButtonShape;
  dragging: boolean;
  selected: boolean;
  textColor?: string;
  showInput: boolean;
  inputChildren: React.ReactNode;
  onClick: (event: React.MouseEvent) => void;
  onChangeSelection: (event: AccessibleEvent) => void;
  onToggleSelection: (event: AccessibleEvent) => void;
  onMultiSelection: (event: AccessibleEvent) => void;
  onDoubleClick: (event: AccessibleEvent) => void;
  onDragHandleTrigger?: (event: PointerEvent | React.PointerEvent) => void;
}

const BarButton = React.memo((props: BarButtonProps): JSX.Element => {
  const {
    refId,
    name,
    summary,
    shape,
    dragging,
    selected,
    textColor,
    showInput,
    inputChildren,
    onClick,
    onChangeSelection,
    onToggleSelection,
    onMultiSelection,
    onDoubleClick,
    onDragHandleTrigger,
  } = props;
  const wasDraggingAfterPointerDown = useRef(dragging);
  useEffect(() => {
    if (dragging) {
      wasDraggingAfterPointerDown.current = true;
    }
  }, [dragging]);
  return (
    <StyledBarIconButton
      component="div"
      id={`data-${refId}`}
      className={StyledBarIconButton.displayName}
      onPointerDown={(e): void => {
        if (onDragHandleTrigger) {
          onDragHandleTrigger(e);
        }
        wasDraggingAfterPointerDown.current = false;
      }}
      {...onTapSelectButton(
        false,
        false,
        (e) => onChangeSelection(e),
        (e) => onToggleSelection(e),
        (e) => onMultiSelection(e),
        (e): void => {
          if (!wasDraggingAfterPointerDown.current) {
            if (onClick) {
              onClick(e);
            }
          }
        },
        false
      )}
      onDoubleClick={(e): void => onDoubleClick(e)}
      shape={shape}
      disableRipple
    >
      <StyledBar className={StyledBar.displayName}>
        <StyledName
          className={StyledName.displayName}
          selected={selected}
          style={{ color: textColor }}
        >
          {showInput ? (
            inputChildren
          ) : (
            <StyledUnselectableText
              className={StyledUnselectableText.displayName}
            >
              {name}
            </StyledUnselectableText>
          )}
        </StyledName>
        {!showInput && (
          <StyledSummary
            className={StyledSummary.displayName}
            selected={selected}
            style={{ color: textColor }}
          >
            <StyledUnselectableText
              className={StyledUnselectableText.displayName}
            >
              {summary}
            </StyledUnselectableText>
          </StyledSummary>
        )}
      </StyledBar>
    </StyledBarIconButton>
  );
});

const StyledDataButton = styled.div`
  display: flex;
  padding: ${(props): string =>
    props.theme.spacing(props.theme.space.reorderableTop, 0)};
  min-width: 0;
  user-select: none;
  touch-callout: none;
`;

const StyledBoxArea = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: ${(props): string => props.theme.minHeight.dataButton};
  user-select: none;
  touch-callout: none;
`;

const StyledBackgroundArea = styled(StyledBackground)`
  user-select: none;
  touch-callout: none;
`;

const StyledBarBackground = styled(StyledBackground)<{
  shape: ButtonShape;
  multidragging: boolean;
  selected: boolean;
}>`
  background-color: ${(props): string =>
    props.selected ? "white" : props.theme.colors.container};

  border-radius: ${(props): string =>
    props.shape === ButtonShape.Pill
      ? props.theme.borderRadius.pill
      : props.theme.borderRadius.box};

  box-shadow: ${(props): string =>
    props.multidragging
      ? props.theme.boxShadow.multiDragging
      : props.selected
      ? props.theme.boxShadow.selected
      : props.theme.boxShadow.normal};
  user-select: none;
  touch-callout: none;
`;

const StyledContent = styled.div<{
  position: "absolute" | "relative";
  shape: ButtonShape;
  dragging: boolean;
  ghostingCount: number;
}>`
  position: ${(props): string => props.position};
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex: 1;
  min-width: ${(props): string => props.theme.minWidth.dataButton};
  backface-visibility: hidden;
  user-select: none;
  touch-callout: none;
`;

const StyledLeftPaddingArea = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0;
  bottom: 0;
  left: -${(props): string => props.theme.spacing(props.theme.space.panelLeft)};
  min-width: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  user-select: none;
  touch-callout: none;

  ${(props): string => props.theme.breakpoints.down("sm")} {
    left: -${(props): string => props.theme.spacing(3)};
    min-width: ${(props): string => props.theme.spacing(3)};
  }
`;

const StyledRightPaddingArea = styled.div`
  display: flex;
  position: relative;
  min-width: ${(props): string => props.theme.minWidth.headerIcon};
  user-select: none;
  touch-callout: none;

  ${(props): string => props.theme.breakpoints.down("sm")} {
    min-width: ${(props): string => props.theme.spacing(2)};
  }
`;

interface ButtonBoxProps extends DataButtonInfo {
  refId: string;
  shape: ButtonShape;
  allIds: string[];
  draggingIds: string[];
  selectedIds: string[];
  ghostingIds: string[]; // An reorderable ghosts when it is part of a group selection that is being dragged, but it is not the main draggable being dragged.
  disabled: boolean;
  grow: boolean;
  showInput: boolean;
  inputChildren: React.ReactNode;
  onClick: (id: string, event: React.MouseEvent) => void;
  onChangeSelection: (id: string, event: AccessibleEvent) => void;
  onToggleSelection: (id: string, event: AccessibleEvent) => void;
  onMultiSelection: (
    id: string,
    allIds: string[],
    event: AccessibleEvent
  ) => void;
  onContextMenu: (event: AccessibleEvent) => void;
  onDoubleClick: (id: string, event: AccessibleEvent) => void;
  onDragHandleTrigger?: (event: PointerEvent | React.PointerEvent) => void;
}

const ButtonBox = React.memo((props: ButtonBoxProps): JSX.Element => {
  const {
    refId,
    shape,
    allIds,
    name,
    summary,
    icon,
    iconColor,
    textColor,
    draggingIds,
    ghostingIds,
    selectedIds,
    disabled,
    grow,
    showInput,
    inputChildren,
    onClick,
    onChangeSelection,
    onToggleSelection,
    onMultiSelection,
    onContextMenu,
    onDoubleClick,
    onDragHandleTrigger,
  } = props;

  const ghostingCount = ghostingIds?.length || 0;
  const dragging = draggingIds?.includes(refId);
  const selected = selectedIds?.includes(refId);
  const ghosting = ghostingIds?.includes(refId);
  const multidragging = isMultiDragging(dragging, ghostingCount);
  const handleContextMenu = useCallback(
    (event: React.MouseEvent): void => {
      if (!selected) {
        onChangeSelection(refId, event);
      }
      event.preventDefault();
      if (event.button === 2) {
        if (onContextMenu) {
          onContextMenu(event);
        }
      }
    },
    [refId, selected, onChangeSelection, onContextMenu]
  );
  const handleChangeSelection = useCallback(
    (event: AccessibleEvent): void => {
      onChangeSelection(refId, event);
    },
    [refId, onChangeSelection]
  );
  const handleToggleSelection = useCallback(
    (event: AccessibleEvent): void => {
      onToggleSelection(refId, event);
    },
    [refId, onToggleSelection]
  );
  const handleMultiSelection = useCallback(
    (event: AccessibleEvent): void => {
      onMultiSelection(refId, allIds, event);
      onContextMenu(event);
    },
    [refId, allIds, onMultiSelection, onContextMenu]
  );
  const handleClick = useCallback(
    (event: React.MouseEvent): void => {
      if (onClick) {
        onClick(refId, event);
      }
    },
    [onClick, refId]
  );
  const handleDoubleClick = useCallback(
    (event: AccessibleEvent): void => {
      onDoubleClick(refId, event);
    },
    [refId, onDoubleClick]
  );

  return (
    <StyledBoxArea
      className={StyledBoxArea.displayName}
      onContextMenu={handleContextMenu}
      style={{
        transform: dragging ? "scale(1.03)" : undefined,
        transition: "transform 0.2s ease",
      }}
    >
      <StyledBackgroundArea
        className={StyledBackgroundArea.displayName}
        style={{ opacity: disabled || ghosting ? "0.5" : undefined }}
      >
        <StyledBarBackground
          className={StyledBackground.displayName}
          shape={shape}
          multidragging={multidragging}
          selected={selected}
        />
        <StyledToggleBackground
          className={StyledToggleBackground.displayName}
          shape={shape}
          multidragging={multidragging}
          selected={selected}
          iconcolor={iconColor}
        />
      </StyledBackgroundArea>
      <StyledContent
        className={StyledContent.displayName}
        shape={shape}
        dragging={dragging}
        ghostingCount={ghostingCount}
        position={grow ? "absolute" : "relative"}
      >
        <ToggleButton
          icon={icon}
          shape={shape}
          ghostingCount={ghostingCount}
          dragging={dragging}
          selected={selected}
          onToggleSelection={handleToggleSelection}
          onMultiSelection={handleMultiSelection}
          onDragHandleTrigger={onDragHandleTrigger}
        />
        <BarButton
          refId={refId}
          name={name}
          summary={summary}
          shape={shape}
          dragging={dragging}
          selected={selected}
          textColor={textColor}
          showInput={showInput}
          inputChildren={inputChildren}
          onClick={handleClick}
          onChangeSelection={handleChangeSelection}
          onToggleSelection={handleToggleSelection}
          onMultiSelection={handleMultiSelection}
          onDoubleClick={handleDoubleClick}
          onDragHandleTrigger={onDragHandleTrigger}
        />
      </StyledContent>
    </StyledBoxArea>
  );
});

interface DataButtonProps extends DataButtonInfo {
  shape: ButtonShape;
  allIds: string[];
  draggingIds: string[];
  selectedIds: string[];
  ghostingIds: string[]; // An reorderable ghosts when it is part of a group selection that is being dragged, but it is not the main draggable being dragged.
  disabled?: boolean;
  grow?: boolean;
  showInput: boolean;
  inputChildren?: React.ReactNode;
  leftPaddingChildren?: React.ReactNode;
  rightPaddingChildren?: React.ReactNode;
  onClick?: (id: string, event: React.MouseEvent) => void;
  onChangeSelection: (id: string, event: AccessibleEvent) => void;
  onToggleSelection: (id: string, event: AccessibleEvent) => void;
  onMultiSelection: (
    id: string,
    allIds: string[],
    event: AccessibleEvent
  ) => void;
  onContextMenu: (event: AccessibleEvent) => void;
  onDoubleClick: (id: string, event: AccessibleEvent) => void;
  onDragHandleTrigger?: (event: PointerEvent | React.PointerEvent) => void;
}

const DataButton = (props: DataButtonProps): JSX.Element => {
  const {
    shape,
    allIds,
    refId,
    refTypeId,
    name,
    summary,
    icon,
    iconColor,
    textColor,
    hasChildren,
    draggingIds,
    ghostingIds,
    selectedIds,
    disabled = false,
    grow = false,
    showInput,
    inputChildren,
    leftPaddingChildren,
    rightPaddingChildren,
    onClick,
    onChangeSelection,
    onToggleSelection,
    onMultiSelection,
    onContextMenu,
    onDoubleClick,
    onDragHandleTrigger,
  } = props;
  return (
    <StyledDataButton className={StyledDataButton.displayName}>
      <StyledLeftPaddingArea className={StyledLeftPaddingArea.displayName}>
        {leftPaddingChildren}
      </StyledLeftPaddingArea>
      <ButtonBox
        shape={shape}
        allIds={allIds}
        refId={refId}
        refTypeId={refTypeId}
        name={name}
        summary={summary}
        icon={icon}
        iconColor={iconColor}
        textColor={textColor}
        hasChildren={hasChildren}
        draggingIds={draggingIds}
        ghostingIds={ghostingIds}
        selectedIds={selectedIds}
        disabled={disabled}
        grow={grow}
        showInput={showInput}
        inputChildren={inputChildren}
        onClick={onClick}
        onChangeSelection={onChangeSelection}
        onToggleSelection={onToggleSelection}
        onMultiSelection={onMultiSelection}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
        onDragHandleTrigger={onDragHandleTrigger}
      />
      <StyledRightPaddingArea className={StyledRightPaddingArea.displayName}>
        {rightPaddingChildren}
      </StyledRightPaddingArea>
    </StyledDataButton>
  );
};

export default DataButton;
