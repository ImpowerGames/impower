import styled from "@emotion/styled";
import { motion } from "framer-motion";

const popListItemAnimationVariants = {
  hidden: { scale: 0, opacity: 0 },
  show: { scale: 1, opacity: 1 },
};

const smoothAnimationTransition = {
  type: "spring",
  stiffness: 200,
  damping: 20,
  mass: 0.5,
};

const StyledMotionListItem = styled(motion.div)``;

interface PopListTransitionProps {
  children: React.ReactNode;
}

const PopListItemTransition = (props: PopListTransitionProps): JSX.Element => {
  const { children } = props;
  return (
    <StyledMotionListItem
      variants={popListItemAnimationVariants}
      transition={smoothAnimationTransition}
    >
      {children}
    </StyledMotionListItem>
  );
};

export default PopListItemTransition;
