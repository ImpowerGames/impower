import { useEffect, useMemo, useState } from "react";
import { DataStateQueryPath } from "../types/dataStatePath";

export const useCollectionDataLoad = <T>(
  onLoad?: (data: { [id: string]: T }) => void,
  options?: {
    source?: "cache" | "server";
    orderByChild?: string;
    limitToFirst?: number;
    limitToLast?: number;
  },
  ...path: DataStateQueryPath
): { [id: string]: T } => {
  const { source, orderByChild, limitToFirst, limitToLast } = options;

  const [collection, setCollection] = useState<{ [id: string]: T }>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedPath = useMemo(() => path, path);

  useEffect(() => {
    if (memoizedPath === undefined || memoizedPath?.includes(undefined)) {
      setCollection(undefined);
      return;
    }

    if (!memoizedPath || memoizedPath?.includes(null)) {
      setCollection(null);
      if (onLoad) {
        onLoad(null);
      }
      return;
    }

    setCollection(undefined);

    const getData = async (): Promise<void> => {
      const DataStateQuery = (await import("../classes/dataStateQuery"))
        .default;
      let query = new DataStateQuery(...memoizedPath);
      if (orderByChild) {
        query = query.orderByChild(orderByChild);
      }
      if (limitToFirst) {
        query = query.limitToFirst(limitToFirst);
      }
      if (limitToLast) {
        query = query.limitToLast(limitToLast);
      }
      const snapshot = await query.get(source === "cache");
      const data = snapshot.val();
      setCollection(data);
      if (onLoad) {
        onLoad(data);
      }
    };
    getData();
  }, [onLoad, orderByChild, memoizedPath, limitToFirst, limitToLast, source]);

  return collection;
};
