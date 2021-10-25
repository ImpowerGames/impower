import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import React from "react";

const StyledLabelTypography = styled(Typography)`
  max-width: 100%;
  min-height: 56px;

  @keyframes animate {
    0%,
    100% {
      opacity: 1;
    }
    20% {
      opacity: 0.5;
    }
    40% {
      opacity: 1;
    }
  }

  & {
    position: relative;
    -webkit-box-reflect: below -48px linear-gradient(transparent, rgba(0, 0, 0, 0.2));
  }
`;

const StyledMark = styled.mark<{ index: number }>`
  background-color: initial;
  color: inherit;
  position: relative;
  display: inline-block;
  animation: animate 1s ease-in-out infinite;
  animation-delay: calc(0.1s * ${(props): number => props.index});
`;

interface AnimatedLoadingTextProps {
  message?: string;
  style?: React.CSSProperties;
}

const AnimatedLoadingText = React.memo(
  (props: AnimatedLoadingTextProps): JSX.Element => {
    const { message = "Loading...", style } = props;

    return (
      <StyledLabelTypography variant="h4" color="textSecondary" style={style}>
        {message.split("").map((c, index) => (
          <StyledMark key={index} index={index}>
            {c}
          </StyledMark>
        ))}
      </StyledLabelTypography>
    );
  }
);

export default AnimatedLoadingText;
