import React, { PropsWithChildren } from "react";
import { Transition } from "framer-motion";
import MotionDiv from "./MotionDiv";
import { TransitionState } from "../../hooks/useTransitionAnimation";

const defaultPosition = "absolute";
const defaultAmount = 0.97;
const defaultDuration = 0.3;
const exitTimeScale = 0.3;
const enterTimeScale = 0.7;

interface CustomProps {
  position?: "relative" | "absolute";
  exitPosition?: "relative" | "absolute";
  amount?: number;
  duration?: number;
  exitBeforeEnter?: boolean;
}

const animationVariants = {
  initial: (
    props: CustomProps
  ): {
    position?: "relative" | "absolute";
    scale: number;
    opacity: number;
    transition: Transition;
  } => {
    return {
      position: "absolute",
      scale: props?.amount || defaultAmount,
      opacity: 0,
      transition: {
        type: "tween",
        ease: "linear",
        duration: 0.01,
      },
    };
  },
  enter: (
    props: CustomProps
  ): {
    position?: "relative" | "absolute";
    zIndex: number;
    scale: number;
    opacity: number;
    transition: Transition;
  } => {
    return {
      position: props?.position || defaultPosition,
      zIndex: 1,
      scale: 1,
      opacity: 1,
      transition: {
        type: "tween",
        ease: "easeOut",
        delay: props?.exitBeforeEnter
          ? exitTimeScale * (props?.duration || defaultDuration)
          : undefined,
        duration: enterTimeScale * (props?.duration || defaultDuration),
      },
    };
  },
  exit: (
    props: CustomProps
  ): {
    position?: "relative" | "absolute";
    zIndex: number;
    scale: number;
    opacity: number;
    transition: Transition;
  } => {
    return {
      position: props?.exitPosition || defaultPosition,
      zIndex: 0,
      scale: 1,
      opacity: 0,
      transition: {
        type: "tween",
        ease: "easeIn",
        duration: exitTimeScale * (props?.duration || defaultDuration),
      },
    };
  },
};

interface TopLevelTransitionProps {
  initial?: boolean | "initial" | "enter" | "exit";
  custom?: CustomProps;
  animate?: TransitionState;
}

const TopLevelTransition = (
  props: PropsWithChildren<TopLevelTransitionProps>
): JSX.Element | null => {
  const {
    initial = "initial",
    custom,
    animate = TransitionState.enter,
    children,
  } = props;

  return (
    <MotionDiv
      initial={initial}
      animate={animate}
      exit={TransitionState.exit}
      variants={animationVariants}
      custom={custom}
    >
      {children}
    </MotionDiv>
  );
};

export default TopLevelTransition;
