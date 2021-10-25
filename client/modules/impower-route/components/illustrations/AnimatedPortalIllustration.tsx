import styled from "@emotion/styled";
import React from "react";
import IllustrationImage from "../../../../resources/illustrations/fogg-5.svg";

const StyledAnimation = styled(IllustrationImage)`
  backface-visibility: hidden;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  & .fogg-5_svg__portal {
    animation: spin 10s infinite;
    animation-timing-function: linear;
    transform-origin: 50% 45%;
  }
`;

const AnimatedPortalIllustration = React.memo((): JSX.Element => {
  return <StyledAnimation />;
});

export default AnimatedPortalIllustration;
