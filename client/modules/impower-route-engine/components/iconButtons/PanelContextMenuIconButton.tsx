import { useTheme } from "@emotion/react";
import IconButton from "@material-ui/core/IconButton";
import React, { PropsWithChildren } from "react";
import { FontIcon } from "../../../impower-icon";

interface PanelContextMenuIconButtonProps {
  "icon": React.ReactNode;
  "aria-label": string;
  "disabled"?: boolean;
  "onMouseDown"?: React.MouseEventHandler<HTMLButtonElement>;
  "onPointerUp"?: React.PointerEventHandler<HTMLButtonElement>;
  "onClick"?: React.MouseEventHandler<HTMLButtonElement>;
}

const PanelContextMenuIconButton = (
  props: PropsWithChildren<PanelContextMenuIconButtonProps>
): JSX.Element => {
  const theme = useTheme();
  const {
    icon,
    "aria-label": ariaLabel,
    disabled = false,
    onMouseDown,
    onPointerUp,
    onClick,
  } = props;
  const iconSize = theme.fontSize.smallIcon;
  const color = theme.colors.white50;
  return (
    <IconButton
      disabled={disabled}
      style={{ color }}
      onMouseDown={onMouseDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
    >
      <FontIcon aria-label={ariaLabel} size={iconSize}>
        {icon}
      </FontIcon>
    </IconButton>
  );
};

export default PanelContextMenuIconButton;
