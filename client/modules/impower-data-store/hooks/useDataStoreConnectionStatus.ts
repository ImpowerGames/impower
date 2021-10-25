import { useState, useEffect } from "react";

export const useDataStoreConnectionStatus = (): boolean => {
  const [status, setStatus] = useState<boolean>(undefined);

  useEffect(() => {
    const getData = async (): Promise<void> => {
      const DataStoreRead = (await import("../classes/dataStoreRead")).default;
      const logInfo = (await import("../../impower-logger/utils/logInfo"))
        .default;
      try {
        await new DataStoreRead("info", "connected").get(false);
        logInfo("DataStore", "ONLINE");
        setStatus(true);
      } catch {
        logInfo("DataStore", "OFFLINE");
        setStatus(false);
      }
    };
    getData();
  }, []);

  return status;
};
