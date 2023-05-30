import React from "react";

export enum PointerDevice {
  Touch = "Touch",
  Mouse = "Mouse",
}

export interface DeviceContextState {
  pointer: PointerDevice;
}

export const createDeviceContextState = (): DeviceContextState => ({
  pointer: PointerDevice.Touch,
});

export const DeviceContext = React.createContext<DeviceContextState>(undefined);
