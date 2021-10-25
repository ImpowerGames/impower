import styled from "@emotion/styled";
import React, { PropsWithChildren, useMemo } from "react";
import { AnimationProps, useAnimation } from "../../hooks/useAnimation";

const StyledAnimation = styled.div`
  backface-visibility: hidden;
`;

const RotateAnimation = React.forwardRef(
  (
    props: PropsWithChildren<AnimationProps>,
    ref: React.ForwardedRef<HTMLDivElement>
  ): JSX.Element => {
    const {
      animate = 45,
      duration = 0.15,
      ease = "ease-out-back",
      children,
      style,
      ...other
    } = props;

    const [state, animationStyle, onTransitionEnd] = useAnimation({
      ...props,
      animate,
      duration,
      ease,
      transitionProperty: "transform",
    });

    const currentStyle: React.CSSProperties = useMemo(
      () => ({
        transform: `rotate(${state}deg)`,
        transitionProperty: "transform",
        willChange: "transform",
        ...animationStyle,
        ...style,
      }),
      [animationStyle, state, style]
    );

    return (
      <StyledAnimation
        ref={ref}
        {...other}
        style={currentStyle}
        onTransitionEnd={onTransitionEnd}
      >
        {children}
      </StyledAnimation>
    );
  }
);

export default RotateAnimation;
