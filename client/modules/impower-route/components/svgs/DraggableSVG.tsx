import styled from "@emotion/styled";
import React from "react";

// This component allows IconButtons to be dragged
export const StyledDraggableSVG = styled.svg`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
`;

const DraggableSVG = React.memo((): JSX.Element => {
  return <StyledDraggableSVG className={StyledDraggableSVG.displayName} />;
});

export default DraggableSVG;
