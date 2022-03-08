import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { CSSProperties, PropsWithChildren, useContext } from "react";
import { FontIcon } from "../../../impower-icon";
import { ScreenContext } from "../../../impower-route";
import { panels } from "../../types/info/panels";
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

const StyledIcon = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

export enum PanelbarPosition {
  None = "None",
  Top = "Top",
}

interface PanelbarProps {
  openPanel: PanelType;
  panelbarPosition: PanelbarPosition;
}

const Panelbar = (props: PropsWithChildren<PanelbarProps>): JSX.Element => {
  const { openPanel, panelbarPosition, children } = props;

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
    borderBottomColor:
      panelbarPosition === PanelbarPosition.Top ? "transparent" : undefined,
  });

  const panel = panels.find((p) => p.type === openPanel);

  const PanelIcon = panel.iconOn;

  if (children) {
    return (
      <StyledBackground style={getBackgroundStyle(openPanel)}>
        <StyledContent>{children}</StyledContent>
      </StyledBackground>
    );
  }

  return (
    <StyledBackground style={getBackgroundStyle(openPanel)}>
      <StyledContent>
        <StyledIcon
          className={StyledIcon.displayName}
          style={{ color: "white" }}
        >
          <FontIcon
            aria-label={`${panel.name} Panel`}
            size={theme.fontSize.smallIcon}
          >
            <PanelIcon />
          </FontIcon>
        </StyledIcon>
      </StyledContent>
    </StyledBackground>
  );
};

export default Panelbar;
