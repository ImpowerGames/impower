import { useEffect, useState } from "react";
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

  const pathJSON = path ? JSON.stringify(path) : "";

  useEffect(() => {
    if (!pathJSON) {
      setCollection(undefined);
      return;
    }
    const memoizedPath: DataStateQueryPath = JSON.parse(pathJSON);
    if (memoizedPath?.includes(undefined)) {
      setCollection(undefined);
      return;
    }
    if (memoizedPath?.includes(null)) {
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
      const newData = {};
      try {
        const snapshot = await query.get(source === "cache");
        snapshot.forEach((s) => {
          const val = s.val();
          newData[s.key] = val === undefined ? null : val;
        });
      } catch (e) {
        const logError = (await import("../../impower-logger/utils/logError"))
          .default;
        logError("DataState", e);
      }
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
    orderByChild,
    source,
    pathJSON,
  ]);

  return collection;
};
