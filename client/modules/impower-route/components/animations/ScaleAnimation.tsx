import styled from "@emotion/styled";
import React, { PropsWithChildren, useMemo } from "react";
import { AnimationProps, useAnimation } from "../../hooks/useAnimation";

const StyledAnimation = styled.div`
  backface-visibility: hidden;
`;

const ScaleAnimation = React.forwardRef(
  (
    props: PropsWithChildren<AnimationProps>,
    ref: React.ForwardedRef<HTMLDivElement>
  ): JSX.Element => {
    const {
      animate = 1,
      duration = 0.3,
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
        ...animationStyle,
        transitionProperty: "transform",
        willChange: "transform",
        transform: `scale(${state})`,
        pointerEvents: state === 0 ? "none" : undefined,
        ...style,
      }),
      [animationStyle, state, style]
    );

    return (
      <StyledAnimation
        {...other}
        ref={ref}
        style={currentStyle}
        onTransitionEnd={onTransitionEnd}
      >
        {children}
      </StyledAnimation>
    );
  }
);

export default ScaleAnimation;
