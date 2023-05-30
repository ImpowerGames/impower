import React from "react";
import {
  NavigationContext,
  useNavigationContextState,
} from "../../../impower-navigation";

interface NavigationContextProviderProps {
  children?: React.ReactNode;
}

const NavigationContextProvider = React.memo(
  (props: NavigationContextProviderProps): JSX.Element => {
    const { children } = props;

    const navigationContext = useNavigationContextState();

    return (
      <NavigationContext.Provider value={navigationContext}>
        {children}
      </NavigationContext.Provider>
    );
  }
);

export default NavigationContextProvider;
