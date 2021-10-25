import styled from "@emotion/styled";
import { motion } from "framer-motion";
import React, { PropsWithChildren } from "react";
import { TransitionState } from "../../../impower-route";

const animationVariants = {
  initial: { y: "100%", opacity: 1 },
  enter: { y: 0, opacity: 1 },
  exit: { y: "100%", opacity: 0 },
};

const animationTransition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

const StyledFullScreenDialogTransition = styled(motion.div)`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 100000;
  margin-bottom: -100px;
  padding-bottom: 100px;
`;

interface FullScreenDialogTransitionProps {
  backgroundColor?: string;
}

const FullScreenDialogTransition = (
  props: PropsWithChildren<FullScreenDialogTransitionProps>
): JSX.Element | null => {
  const { backgroundColor, children } = props;
  return (
    <StyledFullScreenDialogTransition
      className={StyledFullScreenDialogTransition.displayName}
      variants={animationVariants}
      transition={animationTransition}
      initial={TransitionState.initial}
      animate={TransitionState.enter}
      exit={TransitionState.exit}
      style={{ backgroundColor }}
    >
      {children}
    </StyledFullScreenDialogTransition>
  );
};

export default FullScreenDialogTransition;
