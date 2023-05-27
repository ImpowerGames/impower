import styled from "@emotion/styled";
import React, { PropsWithChildren } from "react";

const StyledPitchToolbar = styled.div`
  position: fixed;
  width: 100vw;
  top: ${(props): string => props.theme.minHeight.navigationBar};
  z-index: 2;
  background-color: ${(props): string => props.theme.palette.primary.main};
  box-shadow: ${(props): string => props.theme.shadows[3]};

  &:before {
    content: "";
    position: absolute;
    top: -64px;
    bottom: 0;
    left: 0;
    right: 0;
    height: -64px;
    background-color: ${(props): string => props.theme.palette.primary.main};
  }
`;

const StyledToolbar = styled.div`
  display: flex;
  background-color: ${(props): string => props.theme.palette.primary.main};
  padding: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
  height: ${(props): string => props.theme.minHeight.navigationTabs};
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  width: 100%;
  margin: auto;
  color: white;
  position: relative;
`;

const StyledToolbarContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  contain: paint size layout style;
`;

const PitchToolbar = React.memo(
  (props: PropsWithChildren<unknown>): JSX.Element => {
    const { children } = props;

    return (
      <StyledPitchToolbar>
        <StyledToolbar>
          <StyledToolbarContent id={"pitch-toolbar"}>
            {children}
          </StyledToolbarContent>
        </StyledToolbar>
      </StyledPitchToolbar>
    );
  }
);

export default PitchToolbar;
