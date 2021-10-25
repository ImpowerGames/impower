import React, { useContext } from "react";
import { ToastContext } from "../../../impower-toast";
import { UserContext, useUserContextState } from "../../../impower-user";

interface UserContextProviderProps {
  children?: React.ReactNode;
}

const UserContextProvider = React.memo(
  (props: UserContextProviderProps): JSX.Element => {
    const { children } = props;

    const toastContext = useContext(ToastContext);
    const userContext = useUserContextState(toastContext);
    return (
      <UserContext.Provider value={userContext}>
        {children}
      </UserContext.Provider>
    );
  }
);

export default UserContextProvider;
