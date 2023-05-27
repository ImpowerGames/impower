import styled from "@emotion/styled";
import React, { PropsWithChildren, useMemo } from "react";
import { AnimationProps, useAnimation } from "../../hooks/useAnimation";

const StyledAnimation = styled.div`
  backface-visibility: hidden;
`;

export interface SlideAnimationProps extends AnimationProps {
  orientation?: "vertical" | "horizontal";
}

const SlideAnimation = React.forwardRef(
  (
    props: PropsWithChildren<SlideAnimationProps>,
    ref: React.ForwardedRef<HTMLDivElement>
  ): JSX.Element => {
    const {
      animate = 0,
      duration = 0.3,
      ease = "ease",
      children,
      orientation = "vertical",
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

    const x = orientation === "horizontal" ? state : 0;
    const y = orientation === "vertical" ? state : 0;

    const currentStyle: React.CSSProperties = useMemo(
      () => ({
        transitionProperty: "transform",
        transform: `translate(${x}px,${y}px)`,
        willChange: "transform",
        ...animationStyle,
        ...style,
      }),
      [animationStyle, style, x, y]
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

export default SlideAnimation;
