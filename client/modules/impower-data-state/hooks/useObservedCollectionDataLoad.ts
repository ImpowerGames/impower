import { useEffect, useMemo, useRef, useState } from "react";
import { difference } from "../../impower-core";
import { DataSnapshot, Unsubscribe } from "../types/aliases";
import { DataStateQueryPath } from "../types/dataStatePath";

export const useObservedCollectionDataLoad = <T>(
  onLoad: (data: { [id: string]: T }, added?: string[]) => void,
  options: {
    orderByChild?: string;
    limitToFirst?: number;
    limitToLast?: number;
  },
  ...path: DataStateQueryPath
): { [id: string]: T } => {
  const { orderByChild, limitToFirst, limitToLast } = options;

  const [data, setData] = useState<{ [id: string]: T }>();
  const dataRef = useRef<{ [id: string]: T }>({});
  const unsubscribeRef = useRef<Unsubscribe>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedPath = useMemo(() => path, path);

  useEffect(() => {
    if (memoizedPath === undefined || memoizedPath?.includes(undefined)) {
      setData(undefined);
      return (): void => null;
    }

    if (!memoizedPath || memoizedPath?.includes(null)) {
      setData(null);
      if (onLoad) {
        onLoad(null);
      }
      return (): void => null;
    }

    setData(undefined);

    const getData = async (): Promise<void> => {
      const DataStateQuery = (await import("../classes/dataStateQuery"))
        .default;
      const onSnapshot = (snapshot: DataSnapshot): void => {
        const newData = snapshot.val();
        const added = newData
          ? difference(Object.keys(newData), Object.keys(dataRef.current || {}))
          : [];
        setData(newData);
        if (onLoad) {
          onLoad(newData, added);
        }
        dataRef.current = newData;
      };
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
      unsubscribeRef.current = await query.observe(onSnapshot);
    };
    getData();
    const unsubscribe = unsubscribeRef.current;
    return (): void => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [onLoad, orderByChild, memoizedPath, limitToFirst, limitToLast]);

  return data;
};
