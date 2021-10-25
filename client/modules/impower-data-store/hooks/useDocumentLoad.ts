import { useEffect, useMemo, useState } from "react";
import { DocumentPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";

export const useDocumentLoad = <T extends DataDocument>(
  onLoad: (doc: T) => void,
  ...path: DocumentPath
): T => {
  const [doc, setDoc] = useState<T>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedPath = useMemo(() => path, path);

  useEffect(() => {
    if (memoizedPath === undefined || memoizedPath?.includes(undefined)) {
      setDoc(undefined);
      return;
    }

    if (!memoizedPath || memoizedPath?.includes(null)) {
      setDoc(null);
      if (onLoad) {
        onLoad(null);
      }
      return;
    }

    setDoc(undefined);

    const getData = async (): Promise<void> => {
      const DataStoreRead = (await import("../classes/dataStoreRead")).default;
      try {
        const snapshot = await new DataStoreRead(...memoizedPath).get();
        const data = snapshot.data() as T;
        setDoc(data);
        if (onLoad) {
          onLoad(data);
        }
      } catch (e) {
        const logError = (await import("../../impower-logger/utils/logError"))
          .default;
        logError("DataStore", e);
        setDoc(null);
        if (onLoad) {
          onLoad(null);
        }
      }
    };

    getData();
  }, [onLoad, memoizedPath]);

  return doc;
};
