import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import React, { useMemo } from "react";
import StyledButtonChildrenArea from "./StyledButtonChildrenArea";

const StyledButton = styled(Button)`
  pointer-events: auto;
  border-radius: 100px;
  min-width: 0;

  white-space: nowrap;
  font-size: ${(props): string => props.theme.fontSize.regular};

  padding: 0;
  display: block;
  vertical-align: middle;

  box-shadow: ${(props): string => props.theme.shadows[6]};
`;

const StyledInput = styled.input`
  pointer-events: inherit;
  touch-action: inherit;
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: none;
`;

const StyledLabel = styled.label`
  pointer-events: inherit;
  touch-action: inherit;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  border-radius: inherit;
  &:hover {
    background-color: rgba(48, 91, 128, 0.04);
  }
`;

const StyledCornerButtonTextArea = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
`;

const StyledCornerButtonIconArea = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const StyledCornerButtonContent = styled.div`
  pointer-events: inherit;
  touch-action: inherit;
  display: flex;
  align-items: inherit;
  justify-content: flex-start;
  width: fit-content;
  position: relative;
  margin: auto;
`;

interface CornerButtonProps {
  variant?: "regular" | "extended";
  disableElevation?: boolean;
  icon?: React.ReactNode;
  label?: string;
  size?: "large" | "medium" | "small";
  color?:
    | "inherit"
    | "primary"
    | "secondary"
    | "success"
    | "error"
    | "info"
    | "warning";
  upload?: boolean;
  innerRef?: React.Ref<HTMLButtonElement>;
  contentRef?: React.Ref<HTMLDivElement>;
  iconRef?: React.Ref<HTMLDivElement>;
  labelRef?: React.Ref<HTMLDivElement>;
  disabled?: boolean;
  buttonStyle?: React.CSSProperties;
  fullWidth?: boolean;
  onClick?: (e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => void;
  onSecondary?: (e: React.MouseEvent) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  children?: React.ReactNode;
}

const CornerButton = React.memo((props: CornerButtonProps): JSX.Element => {
  const {
    variant,
    disableElevation,
    icon,
    label,
    color,
    innerRef,
    contentRef,
    iconRef,
    labelRef,
    disabled,
    size = "large",
    buttonStyle,
    upload,
    fullWidth,
    children,
    onClick,
    onPointerEnter,
    onPointerLeave,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  } = props;
  const buttonSize = size === "small" ? 40 : size === "medium" ? 48 : 56;
  const iconSize = 15;
  const padding = (buttonSize - iconSize) * 0.5;
  const cornerButtonStyle = useMemo(
    () => ({
      width: variant === "regular" ? buttonSize : undefined,
      boxShadow: disableElevation ? "none" : undefined,
      ...buttonStyle,
    }),
    [buttonSize, buttonStyle, disableElevation, variant]
  );
  const contentStyle = useMemo(
    () => ({ width: variant === "regular" ? "100%" : undefined }),
    [variant]
  );
  const iconAreaStyle = useMemo(
    () => ({
      padding,
      fontSize: iconSize,
    }),
    [padding, iconSize]
  );
  const textAreaStyle = useMemo(
    () => ({
      paddingRight: padding,
      marginLeft: -padding * 0.5,
      opacity: variant === "regular" ? 0 : undefined,
    }),
    [padding, variant]
  );
  const childrenAreaStyle = useMemo(
    () => ({
      left: fullWidth || variant === "extended" ? 0 : undefined,
      width: fullWidth || variant === "extended" ? "100%" : undefined,
      marginBottom: buttonSize,
    }),
    [buttonSize, fullWidth, variant]
  );
  return (
    <>
      <StyledButton
        ref={innerRef}
        variant="contained"
        disableElevation={disableElevation}
        color={color}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={upload ? undefined : onClick}
        disabled={disabled}
        fullWidth={fullWidth}
        style={cornerButtonStyle}
      >
        <StyledCornerButtonContent ref={contentRef} style={contentStyle}>
          {icon && (
            <StyledCornerButtonIconArea ref={iconRef} style={iconAreaStyle}>
              {icon}
            </StyledCornerButtonIconArea>
          )}
          {label && (
            <StyledCornerButtonTextArea ref={labelRef} style={textAreaStyle}>
              {label}
            </StyledCornerButtonTextArea>
          )}
        </StyledCornerButtonContent>
        {upload && (
          <>
            <StyledInput
              id={`console-list-option-file-input`}
              type="file"
              multiple
              onChange={onClick}
            />
            <StyledLabel
              htmlFor={`console-list-option-file-input`}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          </>
        )}
      </StyledButton>
      {children && (
        <StyledButtonChildrenArea style={childrenAreaStyle}>
          {children}
        </StyledButtonChildrenArea>
      )}
    </>
  );
});

export default CornerButton;
