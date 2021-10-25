import styled from "@emotion/styled";
import React from "react";
import LandingBg from "../../../../resources/landing-bg.svg";

const template = (selector: string, i: number): string => {
  return `
        ${selector}:nth-of-type(${i}) {
          animation-delay: ${Math.random()}s;
         }
      `;
};
const getAnimations = (selector: string, count: number): string => {
  let str = "";
  for (let index = 0; index < count; index += 1) {
    str += template(selector, index);
  }
  return str;
};

const StyledLandingBg = styled(LandingBg)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  height: 100vh;
  width: 100vw;
  max-width: 100%;

  @keyframes float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-15px);
    }
  }
  @keyframes squish {
    0%,
    100% {
      transform: scale(1, 1);
    }
    50% {
      transform: scale(1, 0.985);
    }
  }

  & .landing-bg_svg__bubble {
    animation: float 3s ease-in-out infinite;
    transform: translateZ(0);
  }

  ${getAnimations(".landing-bg_svg__bubble", 30)}
`;

const SplashImage = React.memo(() => {
  return <StyledLandingBg />;
});

export default SplashImage;
