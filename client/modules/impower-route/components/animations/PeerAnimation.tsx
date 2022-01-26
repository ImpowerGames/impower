import styled from "@emotion/styled";
import React, { ForwardedRef, PropsWithChildren, useMemo } from "react";
import { AnimationProps, useAnimation } from "../../hooks/useAnimation";

const StyledAnimation = styled.div`
  backface-visibility: hidden;
`;

export interface PeerAnimationProps extends AnimationProps {
  horizontal?: boolean;
  vertical?: boolean;
  children: React.ReactNode;
}

const PeerAnimation = React.forwardRef(
  (
    props: PropsWithChildren<PeerAnimationProps>,
    ref: ForwardedRef<HTMLDivElement>
  ): JSX.Element => {
    const {
      id,
      horizontal = true,
      vertical,
      animate = 0,
      duration = 0.15,
      ease = "ease",
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

    const percentage = 100 / React.Children.toArray(children).length;
    const xPercentage = horizontal ? state * percentage : 0;
    const yPercentage = vertical ? state * percentage : 0;

    const currentStyle: React.CSSProperties = useMemo(
      () => ({
        transform: `translate(${xPercentage}%,${yPercentage}%)`,
        display: "flex",
        flexDirection: vertical ? "column" : undefined,
        transitionProperty: "transform",
        willChange: "transform",
        ...animationStyle,
        ...style,
      }),
      [animationStyle, style, vertical, xPercentage, yPercentage]
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

export default PeerAnimation;
