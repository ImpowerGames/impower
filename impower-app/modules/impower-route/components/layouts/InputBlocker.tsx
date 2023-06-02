import styled from "@emotion/styled";
import React from "react";
import Tooltip from "../popups/Tooltip";

const StyledInputBlocker = styled.span`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10000;
`;

interface InputBlockerProps {
  active: boolean;
  tooltip?: Exclude<React.ReactNode, null | undefined>;
}

const InputBlocker = (props: InputBlockerProps): JSX.Element => {
  const { active, tooltip = "" } = props;

  const [tooltipIsOpen, setTooltipIsOpen] = React.useState(false);

  if (!tooltip) {
    return (
      <StyledInputBlocker
        className={StyledInputBlocker.displayName}
        style={{ pointerEvents: active ? "auto" : "none" }}
      />
    );
  }

  return (
    <Tooltip
      title={tooltip}
      open={tooltipIsOpen}
      onOpen={(): void => {
        setTooltipIsOpen(true);
      }}
      onClose={(): void => setTooltipIsOpen(false)}
      disableTouchListener
    >
      <StyledInputBlocker
        className={StyledInputBlocker.displayName}
        style={{ pointerEvents: active ? "auto" : "none" }}
        onClick={(e): void => {
          setTooltipIsOpen(true);
          e.stopPropagation();
        }}
      />
    </Tooltip>
  );
};

export default InputBlocker;
