import { useEffect, useMemo, useState } from "react";
import { DataStateQueryPath } from "../types/dataStatePath";

export const useCollectionDataLoad = <T>(
  onLoad?: (data: { [id: string]: T }) => void,
  options?: {
    source?: "cache" | "server";
    orderByChild?: string;
    equalTo?: number | string | boolean | null;
    limitToFirst?: number;
    limitToLast?: number;
  },
  ...path: DataStateQueryPath
): { [id: string]: T } => {
  const { source, orderByChild, equalTo, limitToFirst, limitToLast } = options;

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
      if (equalTo) {
        query = query.equalTo(equalTo);
      }
      if (limitToFirst) {
        query = query.limitToFirst(limitToFirst);
      }
      if (limitToLast) {
        query = query.limitToLast(limitToLast);
      }
      const snapshot = await query.get(source === "cache");
      const newData = {};
      snapshot.forEach((s) => {
        newData[s.key] = s.val();
      });
      setCollection(newData);
      if (onLoad) {
        onLoad(newData);
      }
    };
    getData();
  }, [
    onLoad,
    equalTo,
    limitToFirst,
    limitToLast,
    memoizedPath,
    orderByChild,
    source,
  ]);

  return collection;
};
