import { useEffect, useState } from "react";
import { DataStateReadPath } from "../types/dataStatePath";

export const useDataValue = <T>(...path: DataStateReadPath): T => {
  const [value, setValue] = useState<T>(undefined);

  const pathJSON = path ? JSON.stringify(path) : "";

  useEffect(() => {
    if (!pathJSON) {
      setValue(undefined);
      return;
    }
    const memoizedPath: DataStateReadPath = JSON.parse(pathJSON);
    if (memoizedPath?.includes(undefined)) {
      setValue(undefined);
      return;
    }
    if (memoizedPath?.includes(null)) {
      setValue(null);
      return;
    }
    const getData = async (): Promise<void> => {
      const DataStateRead = (await import("../classes/dataStateRead")).default;
      const ref = new DataStateRead(...memoizedPath);
      const snapshot = await ref.get();
      const val = snapshot.val();
      setValue(val === undefined ? null : val);
    };
    getData();
  }, [pathJSON]);

  return value;
};
