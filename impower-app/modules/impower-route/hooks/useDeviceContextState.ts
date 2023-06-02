import { useEffect, useMemo, useState } from "react";
import { DeviceContextState, PointerDevice } from "../contexts/deviceContext";

export const useDeviceContextState = (): DeviceContextState => {
  const [pointer, setPointer] = useState(PointerDevice.Touch);

  useEffect(() => {
    setPointer(
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
        ? PointerDevice.Mouse
        : PointerDevice.Touch
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deviceContext = useMemo(
    () => ({
      pointer,
    }),
    [pointer]
  );

  return deviceContext;
};
