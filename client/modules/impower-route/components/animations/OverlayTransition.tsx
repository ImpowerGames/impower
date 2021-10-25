import React, { PropsWithChildren, CSSProperties } from "react";
import { Transition, Variants } from "framer-motion";
import MotionDiv from "./MotionDiv";
import { TransitionState } from "../../hooks/useTransitionAnimation";

const defaultMoveDistance = 300;
const initialPosition = 0;
const timeScale = 1;

interface CustomProps {
  overlayDirection?: number;
  xDirection?: number;
  yDirection?: number;
  xDistance?: number;
  yDistance?: number;
}

const animationVariants = {
  initial: (
    props: CustomProps
  ): {
    x?: number | string;
    y?: number | string;
    zIndex?: number;
    opacity?: number;
    transition?: Transition;
  } => {
    const safeXDistance = props?.xDistance || defaultMoveDistance;
    const safeYDistance = props?.yDistance || defaultMoveDistance;
    const x =
      props?.xDirection !== undefined
        ? props.xDirection > 0
          ? safeXDistance
          : -safeXDistance
        : undefined;
    const y =
      props?.yDirection !== undefined
        ? props.yDirection > 0
          ? safeYDistance
          : -safeYDistance
        : undefined;
    return {
      x: props?.overlayDirection > 0 ? x : initialPosition,
      y: props?.overlayDirection > 0 ? y : initialPosition,
      zIndex: props?.overlayDirection > 0 ? 1 : 0,
      opacity: 0,
    };
  },
  enter: (
    props: CustomProps
  ): {
    x?: number | string;
    y?: number | string;
    zIndex?: number;
    opacity?: number;
    transition?: Transition;
    transitionEnd?: {
      x?: number | string;
      y?: number | string;
    };
  } => {
    return {
      x: initialPosition,
      y: initialPosition,
      opacity: 1,
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: (props?.overlayDirection > 0 ? 0.2 : 0.1) * timeScale,
      },
      transitionEnd: {
        x: 0,
        y: 0,
      },
    };
  },
  exit: (
    props: CustomProps
  ): {
    x?: number | string;
    y?: number | string;
    zIndex?: number;
    opacity?: number;
    transition?: Transition;
  } => {
    const safeXDistance = props?.xDistance || defaultMoveDistance;
    const safeYDistance = props?.yDistance || defaultMoveDistance;
    const x =
      props?.xDirection !== undefined
        ? props.xDirection < 0
          ? -safeXDistance
          : safeXDistance
        : undefined;
    const y =
      props?.yDirection !== undefined
        ? props.yDirection < 0
          ? -safeYDistance
          : safeYDistance
        : undefined;
    return {
      x: props?.overlayDirection > 0 ? initialPosition : x,
      y: props?.overlayDirection > 0 ? initialPosition : y,
      zIndex: props?.overlayDirection > 0 ? 0 : 1,
      opacity: 0,
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: (props?.overlayDirection > 0 ? 0.1 : 0.2) * timeScale,
      },
    };
  },
};

interface PanelTransitionProps {
  custom?: CustomProps;
  style?: CSSProperties;
}

const OverlayTransition = (
  props: PropsWithChildren<PanelTransitionProps>
): JSX.Element | null => {
  const { custom, style, children } = props;

  return (
    <MotionDiv
      initial={TransitionState.initial}
      animate={TransitionState.enter}
      exit={TransitionState.exit}
      variants={animationVariants as Variants}
      custom={custom}
      style={style}
    >
      {children}
    </MotionDiv>
  );
};

export default OverlayTransition;
