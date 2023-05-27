import React from "react";
import {
  ConfirmDialogContext,
  useConfirmDialogContextState,
} from "../../../impower-confirm-dialog";

interface DialogContextProviderProps {
  children?: React.ReactNode;
}

const DialogContextProvider = React.memo(
  (props: DialogContextProviderProps): JSX.Element => {
    const { children } = props;

    const confirmDialogContext = useConfirmDialogContextState();

    return (
      <ConfirmDialogContext.Provider value={confirmDialogContext}>
        {children}
      </ConfirmDialogContext.Provider>
    );
  }
);

export default DialogContextProvider;
