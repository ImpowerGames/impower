import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import React, { useState } from "react";
import DiceFiveSolidIcon from "../../../../resources/icons/solid/dice-five.svg";
import { FontIcon } from "../../../impower-icon";
import RotateAnimation from "../animations/RotateAnimation";

const StyledMotionArea = styled.div``;

const StyledButtonIconArea = styled.div``;

const StyledRandomizeButton = styled(Button)`
  color: ${(props): string => props.theme.palette.text.primary};
  border-color: rgba(0, 0, 0, 0.23);
`;

const StyledLabelArea = styled.div<{ responsive?: boolean }>`
  padding-left: ${(props): string => props.theme.spacing(1.5)};
  ${(props): string => props.theme.breakpoints.down("sm")} {
    ${(props): string => (props.responsive ? `display: none;` : "")}
  }
`;

interface RandomizeButtonProps {
  variant?: "text" | "outlined" | "contained";
  color?:
    | "inherit"
    | "primary"
    | "secondary"
    | "success"
    | "error"
    | "info"
    | "warning";
  size?: number;
  responsive?: boolean;
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  onClick: (e: React.MouseEvent) => void;
}

const RandomizeButton = React.memo(
  (props: RandomizeButtonProps): JSX.Element => {
    const {
      variant = "outlined",
      color = "inherit",
      size = 20,
      responsive,
      label,
      disabled,
      style,
      onClick,
    } = props;
    const [rotation, setRotation] = useState(0);
    return (
      <StyledMotionArea
        onPointerDown={(): void => {
          setRotation(rotation + 180);
        }}
        style={{ pointerEvents: disabled ? "none" : undefined, ...style }}
      >
        <StyledRandomizeButton
          variant={variant}
          size="large"
          color={color}
          disabled={disabled}
          onClick={onClick}
        >
          <StyledButtonIconArea>
            <RotateAnimation
              initial={0}
              animate={rotation}
              style={{ position: "relative" }}
            >
              <FontIcon
                aria-label={label}
                size={size}
                color="rgba(0, 0, 0, 0.5)"
              >
                <DiceFiveSolidIcon />
              </FontIcon>
            </RotateAnimation>
          </StyledButtonIconArea>
          <StyledLabelArea responsive={responsive}>{label}</StyledLabelArea>
        </StyledRandomizeButton>
      </StyledMotionArea>
    );
  }
);

export default RandomizeButton;
