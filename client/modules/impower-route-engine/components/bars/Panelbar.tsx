import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { CSSProperties, PropsWithChildren, useContext } from "react";
import { ScreenContext } from "../../../impower-route";
import { PanelType } from "../../types/state/panelState";

const StyledBackground = styled.div`
  flex: 1;
  position: relative;

  min-height: ${(props): string => props.theme.minHeight.panel};
  max-height: ${(props): string => props.theme.minHeight.panel};
  opacity: 1;
  line-height: 1;
  color: white;
  z-index: 1;
  padding: 0;

  border: ${(props): string => props.theme.border.tab};
`;

const StyledContent = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: center;
`;

interface PanelbarProps {
  openPanel: PanelType;
}

const Panelbar = (props: PropsWithChildren<PanelbarProps>): JSX.Element => {
  const { openPanel, children } = props;

  const { fullscreen } = useContext(ScreenContext);

  const theme = useTheme();
  const getBackgroundStyle = (panelType: PanelType): CSSProperties => ({
    backgroundColor:
      openPanel === panelType
        ? fullscreen
          ? "black"
          : theme.colors.darkForeground
        : undefined,
    boxShadow: openPanel === panelType ? theme.boxShadow.bottom : undefined,
    borderLeftColor:
      openPanel === panelType ? theme.colors.white10 : "transparent",
    borderRightColor:
      openPanel === panelType ? theme.colors.white10 : "transparent",
    borderTopColor: undefined,
    borderBottomColor: "transparent",
  });

  return (
    <StyledBackground style={getBackgroundStyle(openPanel)}>
      <StyledContent>{children}</StyledContent>
    </StyledBackground>
  );
};

export default Panelbar;
