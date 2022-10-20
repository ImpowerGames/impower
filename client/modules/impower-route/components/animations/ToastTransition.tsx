import Slide, { SlideProps } from "@mui/material/Slide";
import React from "react";

type TransitionProps = Omit<SlideProps, "direction">;

const ToastTransition = React.forwardRef(
  (props: TransitionProps, ref): JSX.Element => (
    <Slide {...props} direction="right" ref={ref} />
  )
);

export default ToastTransition;
