import styled from "@emotion/styled";
import { motion } from "framer-motion";
import React, { PropsWithChildren } from "react";

const StyledRelativeMotionDiv = styled(motion.div)`
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

interface DrawerTransitionProps {
  initial?: boolean | "initial" | "enter" | "exit";
  open: boolean;
  width?: number;
  height?: number;
  justifyContent?: string;
}

const DrawerTransition = (
  props: PropsWithChildren<DrawerTransitionProps>
): JSX.Element | null => {
  const {
    initial = false,
    open,
    width,
    height,
    justifyContent,
    children,
  } = props;

  const fadeAnimationVariants = {
    initial: { width, height, transition: { type: "tween", duration: 0 } },
    enter: {
      width: "auto",
      height: "auto",
      transition: { type: "tween", duration: 0.1, ease: "easeInOut" },
    },
    exit: {
      width,
      height,
      transition: { type: "tween", duration: 0, ease: "easeInOut" },
    },
  };

  return (
    <StyledRelativeMotionDiv
      className={StyledRelativeMotionDiv.displayName}
      initial={initial}
      animate={open ? "enter" : "exit"}
      variants={fadeAnimationVariants}
      style={{
        pointerEvents: open ? undefined : "none",
        justifyContent,
      }}
    >
      {children}
    </StyledRelativeMotionDiv>
  );
};

export default DrawerTransition;
