import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { CSSProperties, useContext, useMemo } from "react";
import { ScreenContext } from "../../../impower-route";

const StyledBackground = styled.div`
  flex: 1;
  position: relative;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  max-height: ${(props): string => props.theme.minHeight.navigationBar};
  opacity: 1;
  line-height: 1;
  color: white;
  z-index: 1;
  box-shadow: ${(props): string => props.theme.boxShadow.bottom};
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
  children?: React.ReactNode;
}

const Panelbar = (props: PanelbarProps): JSX.Element => {
  const { children } = props;

  const { fullscreen } = useContext(ScreenContext);

  const theme = useTheme();
  const backgroundStyle = useMemo(
    (): CSSProperties => ({
      backgroundColor: fullscreen ? "black" : theme.colors.darkForeground,
    }),
    [fullscreen, theme.colors.darkForeground]
  );

  return (
    <StyledBackground style={backgroundStyle}>
      <StyledContent>{children}</StyledContent>
    </StyledBackground>
  );
};

export default Panelbar;
