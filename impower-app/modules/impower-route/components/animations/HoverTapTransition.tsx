import styled from "@emotion/styled";
import { motion, TargetAndTransition } from "framer-motion";
import { CSSProperties, PropsWithChildren } from "react";

const StyledHoverTapTransition = styled(motion.div)`
  border-radius: inherit;
  display: flex;
`;

const StyledMotionArea = styled(motion.div)`
  border-radius: inherit;
  display: flex;
  flex: 1;
`;

interface HoverTapTransitionProps {
  whileHover?: string | TargetAndTransition;
  whileTap?: string | TargetAndTransition;
  initial?: string | boolean | TargetAndTransition | string[];
  animate?: string | TargetAndTransition;
  stretch?: boolean;
  absolute?: boolean;
  style?: CSSProperties;
}

const HoverTapTransition = (
  props: PropsWithChildren<HoverTapTransitionProps>
): JSX.Element => {
  const {
    whileHover,
    whileTap,
    initial,
    animate,
    stretch,
    absolute,
    style,
    children,
  } = props;
  return (
    <StyledHoverTapTransition
      className={StyledHoverTapTransition.displayName}
      whileHover={whileHover}
      whileTap={whileTap}
      style={{
        flex: stretch ? 1 : undefined,
        position: absolute ? "absolute" : "relative",
        top: absolute ? "0" : undefined,
        right: absolute ? "0" : undefined,
        bottom: absolute ? "0" : undefined,
        left: absolute ? "0" : undefined,
        ...style,
      }}
    >
      <StyledMotionArea
        className={StyledMotionArea.displayName}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initial={initial as any}
        animate={animate}
        style={{ alignItems: stretch ? "stretch" : undefined }}
      >
        {children}
      </StyledMotionArea>
    </StyledHoverTapTransition>
  );
};

export default HoverTapTransition;
