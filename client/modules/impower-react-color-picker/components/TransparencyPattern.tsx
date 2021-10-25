import styled from "@emotion/styled";
import React, { CSSProperties } from "react";

const StyledTransparencyPattern = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  border-radius: inherit;

  user-select: none;
  user-drag: none;
  background-color: white;
  background-image: linear-gradient(
      45deg,
      LightGray 25%,
      transparent 25%,
      transparent 75%,
      LightGray 75%,
      LightGray
    ),
    linear-gradient(
      45deg,
      LightGray 25%,
      transparent 25%,
      transparent 75%,
      LightGray 75%,
      LightGray
    );
`;

interface TransparencyPatternProps {
  innerRef?: React.Ref<HTMLDivElement>;
  gridSize?: number;
  style?: CSSProperties;
}

export const TransparencyPattern = React.memo(
  (props: React.PropsWithChildren<TransparencyPatternProps>): JSX.Element => {
    const { innerRef, gridSize = 8, style, children } = props;
    return (
      <StyledTransparencyPattern
        ref={innerRef}
        className={StyledTransparencyPattern.displayName}
        style={{
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `0 0, ${gridSize * 0.5}px ${gridSize * 0.5}px`,
          ...style,
        }}
      >
        {children}
      </StyledTransparencyPattern>
    );
  }
);
