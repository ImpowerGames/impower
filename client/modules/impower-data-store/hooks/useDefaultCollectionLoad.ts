import { useEffect, useMemo, useState } from "react";
import { CollectionPath } from "../../impower-api";
import { DataDocument } from "../../impower-core";

export const useDefaultCollectionLoad = <T extends DataDocument>(
  onLoad: (docs: { [id: string]: T }) => void,
  defaultDocs: { [id: string]: T } = {},
  ...path: CollectionPath
): { [id: string]: T } => {
  const [docs, setDocs] = useState<{
    [id: string]: T;
  }>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedPath = useMemo(() => path, path);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedDefaultDocs = useMemo(() => defaultDocs, []);

  useEffect(() => {
    if (
      memoizedPath === undefined ||
      (memoizedPath as string[])?.includes(undefined)
    ) {
      setDocs(undefined);
      return;
    }

    if (!memoizedPath || (memoizedPath as string[])?.includes(null)) {
      setDocs(null);
      if (onLoad) {
        onLoad(null);
      }
      return;
    }

    setDocs(undefined);

    const getData = async (): Promise<void> => {
      const DataStoreQuery = (await import("../classes/dataStoreQuery"))
        .default;
      try {
        const snapshot = await new DataStoreQuery(...memoizedPath).get<T>();
        const docs: {
          [id: string]: T;
        } = memoizedDefaultDocs;
        snapshot.docs.forEach((snapshot) => {
          const doc = snapshot.data();
          if (doc) {
            docs[snapshot.id] = doc;
          }
        });
        setDocs(docs);
        if (onLoad) {
          onLoad(docs);
        }
      } catch (e) {
        const logError = (await import("../../impower-logger/utils/logError"))
          .default;
        logError("DataStore", e);
        setDocs(null);
        if (onLoad) {
          onLoad(null);
        }
      }
    };

    getData();
  }, [memoizedDefaultDocs, onLoad, memoizedPath]);

  return docs;
};
