import styled from "@emotion/styled";
import React, { CSSProperties } from "react";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";
import UnmountAnimation from "../../../impower-route/components/animations/UnmountAnimation";

const StyledPanelBottomLeftOverlay = styled(FadeAnimation)`
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
`;

interface PanelBottomRightOverlayProps {
  style?: CSSProperties;
}

const PanelBottomLeftOverlay = (
  props: React.PropsWithChildren<PanelBottomRightOverlayProps>
): JSX.Element => {
  const { style, children } = props;

  return (
    <UnmountAnimation>
      <StyledPanelBottomLeftOverlay
        style={style}
        initial={0}
        animate={1}
        exit={0}
        delay={0.7}
        duration={0.2}
      >
        {children}
      </StyledPanelBottomLeftOverlay>
    </UnmountAnimation>
  );
};

export default PanelBottomLeftOverlay;
