import React from "react";
import { ScreenContext } from "../../contexts/screenContext";
import { useScreenContextState } from "../../hooks/useScreenContextState";

interface ScreenContextProviderProps {
  children?: React.ReactNode;
}

const ScreenContextProvider = React.memo(
  (props: ScreenContextProviderProps): JSX.Element => {
    const { children } = props;

    const screenContext = useScreenContextState({});

    return (
      <ScreenContext.Provider value={screenContext}>
        {children}
      </ScreenContext.Provider>
    );
  }
);

export default ScreenContextProvider;
