import styled from "@emotion/styled";
import React from "react";

const StyledNavigationBarSpacer = styled.div`
  margin-top: env(safe-area-inset-top, 0);
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const NavigationBarSpacer = React.memo(() => {
  return <StyledNavigationBarSpacer />;
});

export default NavigationBarSpacer;
