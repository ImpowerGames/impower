import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { useMediaQuery } from "@material-ui/core";
import React, { PropsWithChildren } from "react";

const StyledAppContent = styled.div`
  flex: 1;

  display: flex;
  min-width: 0;
  height: 100%;

  @media (hover: hover) and (pointer: fine) {
    .MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }

  @keyframes MuiSkeleton-keyframes-pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
    100% {
      opacity: 1;
    }
  }

  * .MuiSkeleton-pulse {
    animation: MuiSkeleton-keyframes-pulse 1.5s ease-in-out 0.5s infinite;
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, "Courier New",
      monospace;
  }

  *:focus {
    outline: none;
  }

  svg {
    fill: currentColor;
  }
`;

const StyledAppContentArea = styled.div`
  height: 100%;
  flex: 1;

  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const StyledFontLoader = styled.p``;

interface AppContentProps {
  navigationChildren?: React.ReactNode;
  fullscreen: boolean;
}

const AppContent = React.memo(
  (props: PropsWithChildren<AppContentProps>): JSX.Element | null => {
    const { fullscreen, navigationChildren, children } = props;

    const theme = useTheme();
    const belowXsBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));
    const flexDirection = belowXsBreakpoint ? "column" : undefined;

    return (
      <>
        <StyledAppContent style={{ flexDirection }}>
          {navigationChildren}
          <StyledAppContentArea
            style={{
              position: fullscreen ? "fixed" : undefined,
            }}
          >
            {children}
          </StyledAppContentArea>
        </StyledAppContent>
        {/* Load fonts so they don't flash later */}
        <StyledFontLoader
          style={{
            fontFamily: theme.fontFamily.title,
            top: "-1000vh",
            left: "-1000vw",
            position: "absolute",
            pointerEvents: "none",
          }}
        >
          .
        </StyledFontLoader>
      </>
    );
  }
);

export default AppContent;
