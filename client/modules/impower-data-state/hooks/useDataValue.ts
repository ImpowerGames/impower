import { useEffect, useMemo, useState } from "react";
import { DataStateReadPath } from "../types/dataStatePath";

export const useDataValue = <T>(...path: DataStateReadPath): T => {
  const [value, setValue] = useState<T>(undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedPath = useMemo(() => path, path);

  useEffect(() => {
    if (memoizedPath === undefined || memoizedPath?.includes(undefined)) {
      setValue(undefined);
      return;
    }

    if (!memoizedPath || memoizedPath?.includes(null)) {
      setValue(null);
      return;
    }

    const getData = async (): Promise<void> => {
      const DataStateRead = (await import("../classes/dataStateRead")).default;
      const ref = new DataStateRead(...memoizedPath);
      const snapshot = await ref.get();
      setValue(snapshot.val());
    };
    getData();
  }, [memoizedPath]);

  return value;
};
