export const listAnimationVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      delayChildren: 0.1,
      staggerChildren: 0.1,
    },
  },
};

export const slideListItemAnimationVariants = {
  hidden: { y: 64, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

export const popListItemAnimationVariants = {
  hidden: { scale: 0, opacity: 0 },
  show: { scale: 1, opacity: 1 },
};
