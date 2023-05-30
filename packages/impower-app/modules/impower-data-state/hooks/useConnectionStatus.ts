import { useState, useEffect, useRef } from "react";
import { Unsubscribe } from "../types/aliases";

export const useConnectionStatus = (): boolean => {
  const [status, setStatus] = useState<boolean>(undefined);
  const unsubscribeRef = useRef<Unsubscribe>();

  useEffect(() => {
    const getData = async (): Promise<void> => {
      const DataStateRead = (await import("../classes/dataStateRead")).default;
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      const connectedRef = new DataStateRead(".info", "connected");
      const onSnapshot = async (snapshot): Promise<void> => {
        if (snapshot.val() === true) {
          logInfo("DataState", "ONLINE");
          setStatus(true);
        } else {
          logInfo("DataState", "OFFLINE");
          setStatus(false);
        }
      };
      unsubscribeRef.current = await connectedRef.observe(onSnapshot);
    };
    getData();
    const unsubscribe = unsubscribeRef.current;
    return (): void => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return status;
};
