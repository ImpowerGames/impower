import styled from "@emotion/styled";
import React from "react";

export const StyledOptionArea = styled.div`
  width: 100%;
  padding-top: 6px;
  padding-left: 8px;
  padding-right: 8px;
  padding-bottom: 6px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
`;

const RadioOptionArea = React.memo((): JSX.Element | null => {
  return <StyledOptionArea />;
});

export default RadioOptionArea;
