import { useEffect, useState } from "react";
import { ContributionDocument } from "../types/documents/contributionDocument";

export const usePitchUserContributionDocuments = (
  pitchedCollection: "pitched_projects",
  id: string,
  uid: string,
  onLoad?: (docs: { [id: string]: ContributionDocument }) => void
): { [id: string]: ContributionDocument } => {
  const [docs, setDocs] = useState<{ [id: string]: ContributionDocument }>();

  useEffect(() => {
    if (
      pitchedCollection === undefined ||
      id === undefined ||
      uid === undefined
    ) {
      setDocs(undefined);
      return;
    }
    if (!pitchedCollection || !id || !uid) {
      if (onLoad) {
        onLoad({});
      }
      setDocs({});
      return;
    }
    setDocs(undefined);

    const getData = async (): Promise<void> => {
      const DataStoreQuery = (await import("../classes/dataStoreQuery"))
        .default;
      try {
        const snapshot = await new DataStoreQuery(
          pitchedCollection,
          id,
          "contributions"
        )
          .where("_createdBy", "==", uid)
          .limit(100)
          .get();
        const newDocs = {};
        snapshot.docs.forEach((s) => {
          newDocs[s.id] = s.data();
        });
        setDocs(newDocs);
        if (onLoad) {
          onLoad(newDocs);
        }
      } catch (e) {
        const logError = (await import("../../impower-logger/utils/logError"))
          .default;
        logError("DataStore", e);
        setDocs(null);
      }
    };

    getData();
  }, [uid, id, onLoad, pitchedCollection]);

  return docs;
};
