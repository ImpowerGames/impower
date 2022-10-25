import { useEffect, useState } from "react";
import { PageDocument } from "../../impower-data-store";

export const useAllDocsLoad = <T extends PageDocument>(
  onLoad: (values: { [id: string]: T }) => void,
  parent: "studios" | "projects",
  ids: string[]
): { [id: string]: T } => {
  const [collection, setCollection] = useState<{ [id: string]: T }>();

  const idsJSON = ids ? JSON.stringify(ids) : "";

  useEffect(() => {
    if (!idsJSON || parent === undefined) {
      setCollection(undefined);
      return;
    }
    const memoizedIds: string[] = JSON.parse(idsJSON);
    if (memoizedIds?.includes(undefined)) {
      setCollection(undefined);
      return;
    }
    if (memoizedIds?.includes(null)) {
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
          new DataStateRead(parent, id, "doc")
            .get()
            .then((s): [string, T] => [id, s.val() as T])
        )
      );
      const values: { [id: string]: T } = {};
      entries.forEach(([key, value]) => {
        values[key] = value === undefined ? null : value;
      });
      setCollection(values);
      if (onLoad) {
        onLoad(values);
      }
    };
    getData();
  }, [idsJSON, onLoad, parent]);

  return collection;
};
