import { useEffect, useMemo, useState } from "react";
import { PageDocument } from "../../impower-data-store";

export const useAllDocsLoad = <T extends PageDocument>(
  onLoad: (values: { [id: string]: T }) => void,
  parent: "studios" | "projects",
  ids: string[]
): { [id: string]: T } => {
  const [collection, setCollection] = useState<{ [id: string]: T }>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedIds = useMemo(() => ids, ids || []);

  useEffect(() => {
    if (
      parent === undefined ||
      memoizedIds === undefined ||
      memoizedIds?.includes(undefined)
    ) {
      setCollection(undefined);
      return;
    }

    if (!parent || !memoizedIds || memoizedIds?.includes(null)) {
      setCollection(null);
      if (onLoad) {
        onLoad(null);
      }
      return;
    }

    setCollection(undefined);

    const getData = async (): Promise<void> => {
      const DataStateRead = (await import("../classes/dataStateRead")).default;
      const entries = await Promise.all(
        memoizedIds.map((id) =>
          new DataStateRead(parent, id, "doc").get().then((s) => [id, s.val()])
        )
      );
      const values: { [id: string]: T } = {};
      entries.forEach(([key, value]) => {
        values[key] = value;
      });
      setCollection(values);
      if (onLoad) {
        onLoad(values);
      }
    };
    getData();
  }, [memoizedIds, onLoad, parent]);

  return collection;
};
