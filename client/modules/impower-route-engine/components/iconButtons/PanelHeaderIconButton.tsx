import { useTheme } from "@emotion/react";
import IconButton from "@material-ui/core/IconButton";
import React, { PropsWithChildren } from "react";
import { FontIcon } from "../../../impower-icon";

interface PanelHeaderIconButtonProps {
  "hideTooltip"?: boolean;
  "disabled"?: boolean;
  "icon"?: React.ReactNode;
  "size"?: string;
  "color"?: string;
  "style"?: React.CSSProperties;
  "disableTooltipTouchListener"?: boolean;
  "aria-label"?: string;
  "onMouseDown"?: React.MouseEventHandler<HTMLButtonElement>;
  "onPointerUp"?: React.PointerEventHandler<HTMLButtonElement>;
  "onPointerDown"?: React.PointerEventHandler<HTMLButtonElement>;
  "onClick"?: React.MouseEventHandler<HTMLButtonElement>;
}

const PanelHeaderIconButton = (
  props: PropsWithChildren<PanelHeaderIconButtonProps>
): JSX.Element | null => {
  const theme = useTheme();
  const {
    disabled,
    icon,
    size = theme.fontSize.smallerIcon,
    color,
    style,
    "aria-label": ariaLabel,
    onMouseDown,
    onPointerDown,
    onPointerUp,
    onClick,
  } = props;
  if (icon && ariaLabel !== undefined)
    return (
      <IconButton
        disabled={disabled}
        style={{
          color: color || theme.palette.secondary.main,
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: disabled ? undefined : "auto",
          ...style,
        }}
        onMouseDown={onMouseDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
      >
        <FontIcon aria-label={ariaLabel} size={size}>
          {icon}
        </FontIcon>
      </IconButton>
    );
  return null;
};

export default PanelHeaderIconButton;
