import React from "react";
import { ToastContext, useToastContextState } from "../../../impower-toast";

interface ToastContextProviderProps {
  children?: React.ReactNode;
}

const ToastContextProvider = React.memo(
  (props: ToastContextProviderProps): JSX.Element => {
    const { children } = props;

    const toastContext = useToastContextState();

    return (
      <ToastContext.Provider value={toastContext}>
        {children}
      </ToastContext.Provider>
    );
  }
);

export default ToastContextProvider;
