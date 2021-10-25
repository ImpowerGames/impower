import styled from "@emotion/styled";
import React, { useCallback, useState } from "react";
import MascotHappy00 from "../../../../resources/mascot/professor-happy-00.svg";

const StyledAnimation = styled.div`
  backface-visibility: hidden;

  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  @keyframes wiggle {
    0% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(5deg);
    }
    50% {
      transform: rotate(-5deg);
    }
    75% {
      transform: rotate(5deg);
    }
    100% {
      transform: rotate(0deg);
    }
  }

  @keyframes raise {
    0% {
      transform: translateY(0);
    }
    25% {
      transform: translateY(-8px);
    }
    50% {
      transform: translateY(0);
    }
    75% {
      transform: translateY(-8px);
    }
    100% {
      transform: translateY(0);
    }
  }

  &.animate .professor-happy-00_svg__mustache {
    animation: wiggle 0.5s;
    transform-origin: 50% 50%;
    will-change: transform;
  }

  &.animate .professor-happy-00_svg__left-eyebrow {
    animation: raise 0.5s;
    transform-origin: 50% 50%;
    will-change: transform;
  }

  &.animate .professor-happy-00_svg__right-eyebrow {
    animation: raise 0.5s;
    transform-origin: 50% 50%;
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

const AnimatedHappyMascot = React.memo((): JSX.Element => {
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
      <MascotHappy00 />
      <StyledInteractArea onPointerDown={handlePointerDown} />
    </StyledAnimation>
  );
});

export default AnimatedHappyMascot;
