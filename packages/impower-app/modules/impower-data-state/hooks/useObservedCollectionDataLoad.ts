import { useEffect, useRef, useState } from "react";
import { DataSnapshot, Unsubscribe } from "../types/aliases";
import { DataStateQueryPath } from "../types/dataStatePath";

export const useObservedCollectionDataLoad = <T>(
  onLoad: (data: { [id: string]: T }) => void,
  options: {
    orderByChild?: string;
    equalTo?: number | string | boolean | null;
    limitToFirst?: number;
    limitToLast?: number;
  },
  ...path: DataStateQueryPath
): { [id: string]: T } => {
  const { orderByChild, equalTo, limitToFirst, limitToLast } = options;

  const [data, setData] = useState<{ [id: string]: T }>();
  const dataRef = useRef<{ [id: string]: T }>({});
  const unsubscribeRef = useRef<Unsubscribe>();

  const pathJSON = path ? JSON.stringify(path) : "";

  useEffect(() => {
    if (!pathJSON) {
      setData(undefined);
      return (): void => null;
    }
    const memoizedPath: DataStateQueryPath = JSON.parse(pathJSON);
    if (memoizedPath?.includes(undefined)) {
      setData(undefined);
      return (): void => null;
    }
    if (memoizedPath?.includes(null)) {
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
        snapshot.forEach((s) => {
          const val = s.val();
          dataRef.current[s.key] = val === undefined ? null : val;
        });
        setData(dataRef.current);
        if (onLoad) {
          onLoad(dataRef.current);
        }
      };
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
      unsubscribeRef.current = await query.observe(onSnapshot);
    };
    getData();
    const unsubscribe = unsubscribeRef.current;
    return (): void => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [onLoad, orderByChild, limitToFirst, limitToLast, equalTo, pathJSON]);

  return data;
};
