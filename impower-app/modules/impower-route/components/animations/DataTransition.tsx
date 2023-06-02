import styled from "@emotion/styled";
import { motion } from "framer-motion";
import { CSSProperties, PropsWithChildren } from "react";
import { TransitionState } from "../../hooks/useTransitionAnimation";

const popAnimationVariants = {
  initial: { x: -32, opacity: 0, transition: { stiffness: 300 } },
  enter: { x: 0, opacity: 1, transition: { stiffness: 300 } },
  exit: { x: 32, opacity: 0, transition: { stiffness: 300 } },
};

const fadeAnimationVariants = {
  initial: { opacity: 0, transition: { type: "tween", duration: 0 } },
  enter: { opacity: 1, transition: { type: "tween", duration: 0.3 } },
  exit: { opacity: 0, transition: { type: "tween", duration: 0.3 } },
};

const StyledDataTransition = styled(motion.div)`
  position: relative;
`;

interface DataTransitionProps {
  transformOrigin?: { x: number; y: number };
  type?: "pop" | "fade";
  style?: CSSProperties;
  initial?: TransitionState;
  animate?: TransitionState;
  exit?: TransitionState;
}

const DataTransition = (
  props: PropsWithChildren<DataTransitionProps>
): JSX.Element | null => {
  const {
    transformOrigin,
    type = "pop",
    initial = TransitionState.initial,
    animate = TransitionState.enter,
    exit = TransitionState.exit,
    style,
    children,
  } = props;
  return (
    <StyledDataTransition
      className={StyledDataTransition.displayName}
      variants={type === "pop" ? popAnimationVariants : fadeAnimationVariants}
      style={{
        transformOrigin: transformOrigin
          ? `${transformOrigin.x}px ${transformOrigin.y}px`
          : "center",
        ...style,
      }}
      initial={initial}
      animate={animate}
      exit={exit}
    >
      {children}
    </StyledDataTransition>
  );
};

export default DataTransition;
