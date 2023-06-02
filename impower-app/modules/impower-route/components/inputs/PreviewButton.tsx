import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import IconButton from "@mui/material/IconButton";
import React, { PropsWithChildren } from "react";
import { FontIcon } from "../../../impower-icon";

const StyledPreviewButtonArea = styled.div`
  display: flex;
  align-items: center;
`;

const StyledPreviewButtonBackground = styled.div<{ stroke?: string }>`
  border-radius: ${(props): string => props.theme.borderRadius.field};
  box-shadow: inset 0px 0px 0px 2px
    ${(props): string => props.theme.colors.black20};
  color: white;
  ${(props): string =>
    props.stroke
      ? `& path {
    stroke: ${props.theme.colors.black20};
    stroke-width: 60px;
  }`
      : ""}
  position: relative;
`;

interface PreviewButtonProps {
  icon?: React.ReactNode;
  iconColor?: string;
  backgroundColor?: string;
  tooltip?: string;
  disabled?: boolean;
  stroke?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const PreviewButton = React.memo(
  (props: PropsWithChildren<PreviewButtonProps>): JSX.Element => {
    const {
      icon,
      iconColor,
      backgroundColor,
      tooltip,
      disabled,
      stroke,
      children,
      style,
      onClick,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    } = props;
    const theme = useTheme();
    return (
      <StyledPreviewButtonArea style={style}>
        <StyledPreviewButtonBackground
          className={StyledPreviewButtonBackground.displayName}
          style={{
            backgroundColor,
          }}
          stroke={stroke ? "true" : undefined}
        >
          <IconButton
            disabled={disabled}
            onClick={onClick}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            style={{
              borderRadius: theme.borderRadius.field,
              padding: 0,
              width: 32,
              height: 32,
              opacity: 1,
            }}
          >
            <FontIcon
              aria-label={tooltip}
              size={theme.fontSize.adornmentIcon}
              color={iconColor}
            >
              {icon}
            </FontIcon>
            {children}
          </IconButton>
        </StyledPreviewButtonBackground>
      </StyledPreviewButtonArea>
    );
  }
);

export default PreviewButton;
