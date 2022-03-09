import styled from "@emotion/styled";
import React from "react";

const StyledBottomNavigationBarSpacer = styled.div`
  margin-top: env(safe-area-inset-top, 0);
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  background-color: ${(props): string => props.theme.palette.primary.main};
`;

const BottomNavigationBarSpacer = React.memo(() => {
  return <StyledBottomNavigationBarSpacer className="bottom-navigation-bar" />;
});

export default BottomNavigationBarSpacer;
