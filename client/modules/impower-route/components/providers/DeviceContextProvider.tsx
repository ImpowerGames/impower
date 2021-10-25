import React from "react";
import { DeviceContext, useDeviceContextState } from "../..";

interface DeviceContextProviderProps {
  children?: React.ReactNode;
}

const DeviceContextProvider = React.memo(
  (props: DeviceContextProviderProps): JSX.Element => {
    const { children } = props;

    const deviceContext = useDeviceContextState();

    return (
      <DeviceContext.Provider value={deviceContext}>
        {children}
      </DeviceContext.Provider>
    );
  }
);

export default DeviceContextProvider;
