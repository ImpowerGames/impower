/* eslint react/prop-types: 0 */
import styled from "@emotion/styled";
import { HTMLMotionProps, motion } from "framer-motion";
import React from "react";

const StyledMotionDiv = styled(motion.div)<MotionDivProps>`
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 100%;
`;

interface MotionDivProps {
  position?: string;
}

const MotionDiv = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div"> & MotionDivProps
>((props, ref) => (
  <StyledMotionDiv className={StyledMotionDiv.displayName} {...props} ref={ref}>
    {props.children}
  </StyledMotionDiv>
));
export default MotionDiv;
