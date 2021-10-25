import styled from "@emotion/styled";
import React from "react";

const StyledAspectRatioArea = styled.div<{ aspectRatio?: number }>`
  height: 0;
  width: 100%;
  padding-top: ${(props): number => 100 / props.aspectRatio}%;
  position: relative;
`;

const StyledAspectRatioContent = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  .scrollable & {
    height: auto;
  }
`;

interface AspectRatioBoxProps {
  aspectRatio?: number;
  style?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
  children?: React.ReactNode;
}

const AspectRatioBox = React.forwardRef(
  (
    props: AspectRatioBoxProps,
    ref: React.ForwardedRef<HTMLDivElement>
  ): JSX.Element => {
    const { aspectRatio = 1, style, innerStyle, children } = props;

    return (
      <StyledAspectRatioArea ref={ref} aspectRatio={aspectRatio} style={style}>
        <StyledAspectRatioContent style={innerStyle}>
          {children}
        </StyledAspectRatioContent>
      </StyledAspectRatioArea>
    );
  }
);

export default AspectRatioBox;
