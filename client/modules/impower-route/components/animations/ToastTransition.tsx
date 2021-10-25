import React from "react";
import { SlideProps, Slide } from "@material-ui/core";

type TransitionProps = Omit<SlideProps, "direction">;

const ToastTransition = React.forwardRef(
  (props: TransitionProps, ref): JSX.Element => (
    <Slide {...props} direction="right" ref={ref} />
  )
);

export default ToastTransition;
