import styled from "@emotion/styled";
import { motion } from "framer-motion";

export const listAnimationVariants = {
  hidden: {},
  show: {
    transition: {
      delayChildren: 0.1,
      staggerChildren: 0.1,
    },
  },
};

const StyledMotionList = styled(motion.div)``;

interface ListTransitionProps {
  children: React.ReactNode;
}

const ListTransition = (props: ListTransitionProps): JSX.Element => {
  const { children } = props;
  return (
    <StyledMotionList
      variants={listAnimationVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </StyledMotionList>
  );
};

export default ListTransition;
