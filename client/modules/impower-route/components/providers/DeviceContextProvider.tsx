import React from "react";
import { DeviceContext } from "../../contexts/deviceContext";
import { useDeviceContextState } from "../../hooks/useDeviceContextState";

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
