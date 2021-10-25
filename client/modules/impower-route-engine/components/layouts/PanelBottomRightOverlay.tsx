import styled from "@emotion/styled";
import React, { CSSProperties } from "react";
import { Portal } from "../../../impower-route";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";
import UnmountAnimation from "../../../impower-route/components/animations/UnmountAnimation";

const StyledPanelBottomRightOverlay = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  z-index: 2;
  pointer-events: none;
`;

interface PanelBottomRightOverlayProps {
  style?: CSSProperties;
}

const PanelBottomRightOverlay = (
  props: React.PropsWithChildren<PanelBottomRightOverlayProps>
): JSX.Element => {
  const { style, children } = props;

  if (style?.position === "fixed") {
    return (
      <Portal>
        <UnmountAnimation>
          <StyledPanelBottomRightOverlay
            style={style}
            initial={0}
            animate={1}
            exit={0}
            delay={0.7}
            duration={0.2}
          >
            {children}
          </StyledPanelBottomRightOverlay>
        </UnmountAnimation>
      </Portal>
    );
  }
  return (
    <UnmountAnimation>
      <StyledPanelBottomRightOverlay
        style={style}
        initial={0}
        animate={1}
        exit={0}
        delay={0.7}
        duration={0.2}
      >
        {children}
      </StyledPanelBottomRightOverlay>
    </UnmountAnimation>
  );
};

export default PanelBottomRightOverlay;
