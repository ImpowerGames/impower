import styled from "@emotion/styled";
import React, { useCallback, useState } from "react";
import MascotDefault00 from "../../../../resources/mascot/professor-default-00.svg";

const StyledAnimation = styled.div`
  backface-visibility: hidden;

  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 50%;

  @keyframes blink {
    0% {
      transform: scaleY(1);
    }
    25% {
      transform: scaleY(0.25);
    }
    50% {
      transform: scaleY(1);
    }
    75% {
      transform: scaleY(0.25);
    }
    100% {
      transform: scaleY(1);
    }
  }

  &.animate .professor-default-00_svg__right-eye {
    animation: blink 0.5s;
    transform-origin: 50% 41%;
    will-change: transform;
  }

  &.animate .professor-default-00_svg__left-eye {
    animation: blink 0.5s;
    transform-origin: 50% 41%;
    will-change: transform;
  }
`;

const StyledInteractArea = styled.div`
  pointer-events: auto;
  position: absolute;
  top: 40px;
  bottom: 40px;
  left: 88px;
  right: 88px;
  border-radius: 50%;
`;

const AnimatedLoadingMascotIllustration = React.memo((): JSX.Element => {
  const [animating, setAnimating] = useState(false);
  const handlePointerDown = useCallback(() => {
    setAnimating(true);
  }, []);
  const handleAnimationEnd = useCallback(() => {
    setAnimating(false);
  }, []);
  return (
    <StyledAnimation
      className={animating ? "animate" : undefined}
      onAnimationEnd={handleAnimationEnd}
    >
      <MascotDefault00 />
      <StyledInteractArea onPointerDown={handlePointerDown} />
    </StyledAnimation>
  );
});

export default AnimatedLoadingMascotIllustration;
