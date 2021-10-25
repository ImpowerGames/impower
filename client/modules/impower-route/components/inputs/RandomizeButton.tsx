import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import React, { useState } from "react";
import DiceFiveSolidIcon from "../../../../resources/icons/solid/dice-five.svg";
import { FontIcon } from "../../../impower-icon";
import RotateAnimation from "../animations/RotateAnimation";

const StyledMotionArea = styled.div``;

const StyledButtonIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledRandomizeButton = styled(Button)`
  color: ${(props): string => props.theme.palette.text.primary};
  border-color: rgba(0, 0, 0, 0.23);
`;

interface RandomizeButtonProps {
  color?:
    | "inherit"
    | "primary"
    | "secondary"
    | "success"
    | "error"
    | "info"
    | "warning";
  size?: number;
  label?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  onClick: (e: React.MouseEvent) => void;
}

const RandomizeButton = React.memo(
  (props: RandomizeButtonProps): JSX.Element => {
    const {
      color = "inherit",
      size = 20,
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
          variant="outlined"
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
          {label}
        </StyledRandomizeButton>
      </StyledMotionArea>
    );
  }
);

export default RandomizeButton;
