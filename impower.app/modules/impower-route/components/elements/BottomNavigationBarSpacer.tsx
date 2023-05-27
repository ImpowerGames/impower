import styled from "@emotion/styled";
import React from "react";

const StyledBottomNavigationBarSpacer = styled.div`
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const BottomNavigationBarSpacer = React.memo(() => {
  return <StyledBottomNavigationBarSpacer />;
});

export default BottomNavigationBarSpacer;
