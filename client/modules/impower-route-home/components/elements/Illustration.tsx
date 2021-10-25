import styled from "@emotion/styled";
import React, { PropsWithChildren } from "react";

const StyledIllustrationArea = styled.div`
  margin: auto;
  max-width: 100vw;
`;

const StyledImageArea = styled.div`
  position: relative;
  overflow: hidden;
  position: relative;
  margin: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

interface IllustrationProps {
  style?: React.CSSProperties;
  imageStyle?: React.CSSProperties;
}

const Illustration = (
  props: PropsWithChildren<IllustrationProps>
): JSX.Element => {
  const { style, imageStyle, children } = props;
  return (
    <StyledIllustrationArea style={style}>
      <StyledImageArea style={imageStyle}>{children}</StyledImageArea>
    </StyledIllustrationArea>
  );
};

export default Illustration;
