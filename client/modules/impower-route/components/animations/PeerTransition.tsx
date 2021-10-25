import React, { PropsWithChildren } from "react";
import PeerAnimation, { PeerAnimationProps } from "./PeerAnimation";
import UnmountAnimation from "./UnmountAnimation";

interface PeerTransitionProps extends PeerAnimationProps {
  currentIndex: number;
  previousIndex: number;
}

const PeerTransition = React.memo(
  (props: PropsWithChildren<PeerTransitionProps>): JSX.Element | null => {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ref,
      currentIndex,
      previousIndex,
      children,
      ...other
    } = props;

    const xDirection = currentIndex - previousIndex;

    return (
      <UnmountAnimation
        disableFirstTimeEnter
        exitProps={{
          initial: 0,
          animate: 0,
          exit: xDirection > 0 ? -1 : 1,
          style: {
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
        }}
      >
        <PeerAnimation
          key={currentIndex.toString()}
          initial={xDirection > 0 ? 1 : -1}
          animate={0}
          exit={xDirection > 0 ? -1 : 1}
          {...other}
        >
          {children}
        </PeerAnimation>
      </UnmountAnimation>
    );
  }
);

export default PeerTransition;
